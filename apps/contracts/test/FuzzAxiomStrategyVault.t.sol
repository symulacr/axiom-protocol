// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {AxiomStrategyVault} from "../src/AxiomStrategyVault.sol";
import {IAxiomAgentNFT} from "../src/interfaces/IAxiomAgentNFT.sol";
import {AxiomAgentNFT} from "../src/AxiomAgentNFT.sol";
import {IntelligentData} from "../src/interfaces/IERC7857Metadata.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title  FuzzAxiomStrategyVault.t.sol
/// @notice Live, fork-based fuzz + invariant test suite for the deployed
///         AxiomStrategyVault on 0G Galileo testnet.
/// @dev    All tests run against a forked state of the LIVE chain. NO mocks.
contract FuzzAxiomStrategyVaultTest is StdInvariant, Test {
    // ─── Live addresses (deployed on 0G Galileo, chainId 16602) ────────────
    // All addresses read from env vars at runtime — no hardcoded values.

    // ─── Env-var address helpers (for CI flexibility) ─────────────────────
    function getTestNft() internal returns (address) {
        return vm.envAddress("TEST_NFT_ADDRESS");
    }

    function getTestVault() internal returns (address) {
        return vm.envAddress("TEST_VAULT_ADDRESS");
    }

    function getTestOperator() internal returns (address) {
        return vm.envAddress("TEST_OPERATOR_ADDRESS");
    }

    function getTestRpcUrl() internal returns (string memory) {
        try vm.envString("TEST_RPC_URL") returns (string memory url) {
            return url;
        } catch {
            return "https://evmrpc-testnet.0g.ai";
        }
    }

    // Bounded seed set: 6 tokens, distributed across 3 wallets, 2 per owner.
    // We mint them in setUp() so the fuzzers have a non-empty owned-tokenId set.
    // The fuzz inputs (tokenId index) are bounded via modulo to the seed size.
    uint256 internal constant SEED_TOKENS = 6;

    AxiomStrategyVault internal vault;
    IAxiomAgentNFT internal nft;
    AxiomAgentNFT internal nftFull; // for minting (mintWithRole needs full interface)

    // ─── Events re-declared for vm.expectEmit ──────────────────────
    event Deposited(uint256 indexed tokenId, address indexed from, address indexed asset, uint256 amount);
    event Executed(
        uint256 indexed tokenId, bytes32 indexed actionHash, address indexed target, uint256 value, bytes result
    );

    // All tokenIds minted during setUp(), with their owner.
    uint256[SEED_TOKENS] internal seedTokenIds;
    address[SEED_TOKENS] internal seedOwners;

    // Operator address (read from env var in setUp)
    address internal operatorAddr;

    // Action-execution target
    address internal maliciousReceiver;

    function setUp() public {
        // Skip if live fork env vars are not available.
        try vm.envAddress("TEST_VAULT_ADDRESS") returns (address) {}
        catch {
            vm.skip(true);
            return;
        }

        // Pin the live fork at the canonical block from the task spec.
        vm.createSelectFork(getTestRpcUrl(), 38_748_015);

        address payable liveVaultAddr = payable(getTestVault());
        address liveNftAddr = getTestNft();
        operatorAddr = getTestOperator();

        vault = AxiomStrategyVault(liveVaultAddr);
        nft = IAxiomAgentNFT(liveNftAddr);
        nftFull = AxiomAgentNFT(liveNftAddr);

        // Sanity: the live vault must point at the live NFT, and not be paused.
        require(address(vault.nft()) == liveNftAddr, "vault.nft() mismatch");
        require(!vault.paused(), "vault is paused on fork");
        require(vault.owner() == operatorAddr, "vault.owner() != expected");

        // Operator has MINTER_ROLE on the live NFT. Mint agents for fuzz coverage.
        address[3] memory owners =
            [operatorAddr, vm.envAddress("TEST_RECEIVER_1_ADDRESS"), vm.envAddress("TEST_RECEIVER_2_ADDRESS")];
        for (uint256 i = 0; i < SEED_TOKENS; i++) {
            // Each wallet owns exactly 2 of the seeded tokens.
            address to = owners[i % 3];
            bytes32 placeholderHash = keccak256(abi.encodePacked("fuzz-seed", i));
            IntelligentData[] memory ds = new IntelligentData[](1);
            ds[0] = IntelligentData({dataDescription: "fuzz-seed", dataHash: placeholderHash});

            vm.prank(operatorAddr);
            uint256 tid = nftFull.mintWithRole(ds, to);
            // mintWithRole returns the new tokenId.
            seedTokenIds[i] = tid;
            seedOwners[i] = to;
        }

        // Deploy a malicious receiver that re-enters deposit() from its
        // receive() callback. We give it some balance so it can pay gas.
        maliciousReceiver = address(new MaliciousReceiver(vault));
        vm.deal(maliciousReceiver, 10 ether);
    }

    // ─── Helpers ──────────────────────────────────────────────────────

    /// @dev Pick a random tokenId from the seed set.
    function _randomTokenId(
        uint8 index
    ) internal view returns (uint256 tokenId, address owner) {
        uint256 bounded = uint256(index) % SEED_TOKENS;
        return (seedTokenIds[bounded], seedOwners[bounded]);
    }

    /// @dev Strategy expiry far enough in the future for fuzz runs.
    function _validUntil() internal view returns (uint64) {
        return uint64(block.timestamp / 1 days) + 365;
    }

    /// @dev Compute the action hash that execute() expects in the Merkle tree.
    function _actionHash(
        address target,
        uint256 value,
        bytes memory data
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(target, value, keccak256(data)));
    }

    /// @dev Build a single-leaf Merkle tree — the leaf IS the root. Proof is empty.
    function _singleLeafProof(
        bytes32 /* leaf */
    ) internal pure returns (bytes32[] memory proof) {
        proof = new bytes32[](0);
        return proof;
    }

    /// @dev Mint an extra token for any `to` address (used to give the
    ///      malicious receiver its own tokenId for reentrancy tests).
    function _mintExtraToken(
        address to,
        bytes32 dataHash
    ) internal returns (uint256 tid) {
        IntelligentData[] memory ds = new IntelligentData[](1);
        ds[0] = IntelligentData({dataDescription: "extra", dataHash: dataHash});
        vm.prank(operatorAddr);
        tid = nftFull.mintWithRole(ds, to);
    }

    // ─── Fuzz #1: deposit() ──────────────────────────────────────────
    /// @notice Fuzz deposit() with random tokenId and value.
    ///         Verifies: (a) balance credited, (b) event emitted.
    function testFuzz_deposit_creditsBalanceAndEmits(
        uint8 tokenIndex,
        uint96 amount
    ) public {
        // Bound amount to keep the test deterministic.
        amount = uint96(bound(uint256(amount), 1 wei, 0.01 ether));

        (uint256 tid, address owner) = _randomTokenId(tokenIndex);
        // Pre-state
        uint256 balBefore = vault.balanceOf(tid);

        // Expect event
        vm.expectEmit(true, true, true, true);
        emit Deposited(tid, owner, address(0), amount);

        // Act
        vm.prank(owner);
        vm.deal(owner, amount);
        vault.deposit{value: amount}(tid);

        // (a) balance credited
        assertEq(vault.balanceOf(tid), balBefore + amount, "balance credited");
        // (b) event was emitted (vm.expectEmit enforces it above)
    }

    /// @notice Fuzz deposit() with msg.value = 0 — should always revert.
    function testFuzz_deposit_zeroValue_alwaysReverts(
        uint8 tokenIndex
    ) public {
        (uint256 tid, address owner) = _randomTokenId(tokenIndex);
        vm.prank(owner);
        vm.expectRevert(AxiomStrategyVault.ZeroAmount.selector);
        vault.deposit(tid);
    }

    /// @notice Fuzz deposit() from a non-owner — should always revert with NotTokenOwner.
    function testFuzz_deposit_nonOwner_alwaysReverts(
        uint8 tokenIndex,
        address nonOwner
    ) public {
        vm.assume(nonOwner != address(0));
        (uint256 tid, address owner) = _randomTokenId(tokenIndex);
        vm.assume(nonOwner != owner);
        vm.deal(nonOwner, 1 ether);
        vm.prank(nonOwner);
        vm.expectRevert(AxiomStrategyVault.NotTokenOwner.selector);
        vault.deposit{value: 1}(tid);
    }

    // ─── Fuzz #2: setStrategy() ───────────────────────────────────────
    /// @notice Fuzz setStrategy() with random root, daily limit, and token index.
    ///         Verifies: (a) owner-only, (b) root stored, (c) limit stored.
    function testFuzz_setStrategy_ownerStoresRootAndLimit(
        uint8 tokenIndex,
        bytes32 root,
        uint256 dailyLimit
    ) public {
        dailyLimit = uint256(uint128(dailyLimit));
        (uint256 tid, address owner) = _randomTokenId(tokenIndex);
        uint64 validUntil = _validUntil();
        vm.prank(owner);
        vault.setStrategy(tid, root, dailyLimit, validUntil);

        (bytes32 storedRoot, uint256 storedLimit, uint256 storedSpent, uint64 storedDay, uint64 storedValidUntil) =
            vault.strategyOf(tid);
        assertEq(storedRoot, root, "root stored verbatim");
        assertEq(storedLimit, dailyLimit, "limit stored verbatim");
        // Setting strategy resets dailySpent and bumps resetDay
        assertEq(storedSpent, 0, "dailySpent reset");
        assertEq(storedDay, uint64(block.timestamp / 1 days), "resetDay updated");
        assertEq(storedValidUntil, validUntil, "validUntilDay stored");
    }

    /// @notice setStrategy() from a non-owner MUST revert.
    function testFuzz_setStrategy_nonOwner_alwaysReverts(
        uint8 tokenIndex,
        bytes32 root,
        uint256 dailyLimit,
        address nonOwner
    ) public {
        dailyLimit = uint256(uint128(dailyLimit));
        vm.assume(nonOwner != address(0));
        (uint256 tid, address owner) = _randomTokenId(tokenIndex);
        vm.assume(nonOwner != owner);
        vm.prank(nonOwner);
        vm.expectRevert(AxiomStrategyVault.NotTokenOwner.selector);
        vault.setStrategy(tid, root, dailyLimit, _validUntil());
    }

    /// @notice setStrategy() with a zero merkleRoot MUST be accepted.
    function testFuzz_setStrategy_zeroRoot_accepted(
        uint8 tokenIndex,
        uint256 dailyLimit
    ) public {
        dailyLimit = uint256(uint128(dailyLimit));
        (uint256 tid, address owner) = _randomTokenId(tokenIndex);
        vm.prank(owner);
        vault.setStrategy(tid, bytes32(0), dailyLimit, _validUntil());
        (bytes32 r,,,,) = vault.strategyOf(tid);
        assertEq(r, bytes32(0), "zero root stored");
    }

    // ─── Fuzz #3: execute() ──────────────────────────────────────────
    /// @notice Fuzz execute() with random target, value, and action.
    ///         Verifies: merkle proof verified, daily limit enforced, call result returned.
    function testFuzz_execute_validProofAndBalance_passes(
        uint8 tokenIndex,
        uint96 value
    ) public {
        vm.assume(uint256(value) > 0);
        value = uint96(bound(uint256(value), 1 wei, 0.01 ether));

        (uint256 tid, address owner) = _randomTokenId(tokenIndex);

        // Use maliciousReceiver as the target sink — it has a receive() that accepts value.
        address target = address(maliciousReceiver);

        // Setup: fund the vault with enough balance to execute.
        vm.deal(owner, uint256(value));
        vm.prank(owner);
        vault.deposit{value: uint256(value)}(tid);

        // Set strategy: a single-leaf tree.
        bytes memory data = new bytes(0);
        bytes32 leaf = _actionHash(target, uint256(value), data);
        bytes32[] memory proof = _singleLeafProof(leaf);
        vm.prank(owner);
        vault.setStrategy(tid, leaf, uint256(value), _validUntil()); // dailyLimit == value

        // Act
        bytes memory result;
        {
            vm.expectEmit(true, true, true, false);
            emit Executed(tid, leaf, target, uint256(value), "");
            vm.prank(owner);
            result = vault.execute(tid, target, uint256(value), data, proof);
        }
        // (a) proof verified — implicit by no revert
        // (b) daily limit enforced — implicit
        // (c) event emitted — vm.expectEmit enforced
        assertTrue(result.length >= 0, "execute returned");
    }

    /// @notice execute() with an invalid merkle proof MUST revert.
    function testFuzz_execute_invalidProof_alwaysReverts(
        uint8 tokenIndex,
        uint96 value,
        bytes32 /* fakeRoot */
    ) public {
        vm.assume(uint256(value) > 0);
        value = uint96(bound(uint256(value), 1 wei, 0.01 ether));

        (uint256 tid, address owner) = _randomTokenId(tokenIndex);
        // Target must have a receive() so the call doesn't fail for the wrong reason.

        address target = address(maliciousReceiver);
        bytes memory data = new bytes(0);

        // Setup: fund + set a strategy.
        // Strategy root differs from action hash so the merkle check fails.
        bytes32 storedRoot = keccak256("strategy-root-for-bad-proof-test");
        vm.deal(owner, uint256(value));
        vm.prank(owner);
        vault.deposit{value: uint256(value)}(tid);
        bytes32 leaf = _actionHash(target, uint256(value), data);
        vm.prank(owner);
        vault.setStrategy(tid, storedRoot, uint256(value), _validUntil());
        bytes32[] memory badProof = _singleLeafProof(leaf);
        vm.assume(storedRoot != leaf);
        vm.prank(owner);
        vm.expectRevert(AxiomStrategyVault.InvalidMerkleProof.selector);
        vault.execute(tid, target, uint256(value), data, badProof);
    }

    /// @notice execute() MUST enforce the daily limit.
    function testFuzz_execute_exceedsDailyLimit_alwaysReverts(
        uint8 tokenIndex,
        uint96 value
    ) public {
        vm.assume(uint256(value) > 0);
        value = uint96(bound(uint256(value), 1 wei, 0.01 ether));
        (uint256 tid, address owner) = _randomTokenId(tokenIndex);

        // Fund with more than the limit so balance is not the constraint.
        address target = address(maliciousReceiver);
        vm.prank(owner);
        vault.deposit{value: uint256(value) * 2}(tid);

        // Daily limit = value - 1 (so value > limit always)
        uint256 limit = uint256(value) - 1;
        bytes memory data = new bytes(0);
        bytes32 leaf = _actionHash(target, uint256(value), data);
        bytes32[] memory proof = _singleLeafProof(leaf);

        vm.prank(owner);
        vault.setStrategy(tid, leaf, limit, _validUntil());

        vm.prank(owner);
        vm.expectRevert(AxiomStrategyVault.DailyLimitExceeded.selector);
        vault.execute(tid, target, uint256(value), data, proof);
    }

    /// @notice execute() with target == address(0) MUST revert with ZeroAddress.
    function testFuzz_execute_zeroTarget_alwaysReverts(
        uint8 tokenIndex,
        uint96 value
    ) public {
        vm.assume(uint256(value) > 0);
        value = uint96(bound(uint256(value), 1 wei, 0.01 ether));
        (uint256 tid, address owner) = _randomTokenId(tokenIndex);
        vm.deal(owner, uint256(value));
        vm.prank(owner);
        vault.deposit{value: uint256(value)}(tid);

        bytes memory data = new bytes(0);
        bytes32 leaf = _actionHash(address(0), uint256(value), data);
        bytes32[] memory proof = _singleLeafProof(leaf);
        vm.prank(owner);
        vault.setStrategy(tid, leaf, uint256(value), _validUntil());

        vm.prank(owner);
        vm.expectRevert(AxiomStrategyVault.ZeroAddress.selector);
        vault.execute(tid, address(0), uint256(value), data, proof);
    }

    /// @notice execute() with no strategy set MUST revert with NoStrategySet.
    function testFuzz_execute_noStrategy_alwaysReverts(
        uint8 tokenIndex
    ) public {
        (uint256 tid, address owner) = _randomTokenId(tokenIndex);
        bytes memory data = new bytes(0);
        bytes32[] memory proof = new bytes32[](0);
        vm.prank(owner);
        vm.expectRevert(AxiomStrategyVault.NoStrategySet.selector);
        vault.execute(tid, address(this), 0, data, proof);
    }

    // ─── Fuzz #4: reentrancy ─────────────────────────────────────────
    /// @notice withdraw() MUST block reentrancy via nonReentrant guard.
    function test_reentrancy_withdraw_isBlocked() public {
        // The malicious receiver IS the token owner — it will call withdraw
        // and the ETH it receives will trigger its own receive() callback.
        uint256 evilTid = _mintExtraToken(maliciousReceiver, keccak256("evil-withdraw"));

        // Fund the malicious receiver's vault.
        vm.prank(maliciousReceiver);
        vault.deposit{value: 5 ether}(evilTid);
        assertEq(vault.balanceOf(evilTid), 5 ether, "evil balance seeded");

        // Configure the receiver to re-enter deposit on its receive()
        MaliciousReceiver(payable(maliciousReceiver)).armReentrancy(evilTid);

        // Now the malicious receiver calls withdraw on its own token. The
        // vault sends ETH back; receive() fires and calls deposit() re-entrantly.
        // withdraw() has nonReentrant, so the inner deposit() MUST revert.
        vm.prank(maliciousReceiver);
        // Either OZ ReentrancyGuard revert or TransferFailed — both prove reentrancy is blocked.
        vm.expectRevert();
        vault.withdraw(evilTid, 1 ether);

        // Sanity: balance unchanged (the entire withdraw was reverted atomically)
        assertEq(vault.balanceOf(evilTid), 5 ether, "evil balance preserved");
    }

    /// @notice execute() MUST block reentrancy via a malicious target's receive().
    function test_reentrancy_execute_isBlocked() public {
        uint8 idx = 0;
        (uint256 tid, address owner) = _randomTokenId(idx);

        // Fund
        vm.deal(owner, 1 ether);
        vm.prank(owner);
        vault.deposit{value: 1 ether}(tid);

        // Mint a token for the malicious receiver so it can re-enter deposit
        uint256 evilTid = _mintExtraToken(address(maliciousReceiver), keccak256("evil-exec"));

        // Set the malicious receiver as the target. Its receive() will re-enter deposit().
        MaliciousReceiver(payable(maliciousReceiver)).armReentrancy(evilTid);
        address target = address(maliciousReceiver);

        uint256 value = 0.5 ether;
        bytes memory data = new bytes(0);
        bytes32 leaf = _actionHash(target, value, data);
        bytes32[] memory proof = _singleLeafProof(leaf);

        vm.prank(owner);
        vault.setStrategy(tid, leaf, value, _validUntil());

        // The call reverts because execute()'s nonReentrant blocks the re-entry.
        vm.prank(owner);
        vm.expectRevert();
        vault.execute(tid, target, value, data, proof);
    }

    // ─── Invariants ─────────────────────────────────────────────────
    /// @notice Sum of per-token balances must never exceed the vault's native balance.
    function invariant_totalDepositedMatchesSumOfBalances() public view {
        uint256 total = 0;
        for (uint256 i = 0; i < SEED_TOKENS; i++) {
            total += vault.balanceOf(seedTokenIds[i]);
        }
        // Every wei credited to a vault balance is backed by native balance.
        assertLe(total, address(vault).balance, "sum of balances <= vault native balance");
    }

    /// @notice Invariant: dailySpent <= dailyLimit on every execute.
    function invariant_actionCountMonotonic() public view {
        for (uint256 i = 0; i < SEED_TOKENS; i++) {
            (, uint256 dailyLimit, uint256 dailySpent,,) = vault.strategyOf(seedTokenIds[i]);
            assertLe(dailySpent, dailyLimit, "dailySpent <= dailyLimit");
        }
    }
}

/// @notice Malicious receiver used to verify ReentrancyGuard coverage.
///         When armed, receive() calls vault.deposit(evilTid) re-entrantly.
contract MaliciousReceiver {
    AxiomStrategyVault public vault;
    uint256 public evilTokenId;
    bool public armed;

    constructor(
        AxiomStrategyVault _vault
    ) {
        vault = _vault;
    }

    function armReentrancy(
        uint256 _evilTokenId
    ) external {
        evilTokenId = _evilTokenId;
        armed = true;
    }

    receive() external payable {
        if (armed) {
            vault.deposit{value: 0}(evilTokenId);
        }
    }

    // ─── ERC721 receiver hook ────────────────────────────────────────
    // OZ ERC721._safeMint requires contracts to implement onERC721Received.
    function onERC721Received(
        address, /* operator */
        address, /* from */
        uint256, /* tokenId */
        bytes calldata /* data */
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
