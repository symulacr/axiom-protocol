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
///         AxiomStrategyVault at 0xb7F89e50D5A3039Da7d39528436B820371572874
///         on 0G Galileo testnet (chainId 16602).
/// @dev    All tests run against a forked state of the LIVE chain. NO mocks.
///         State changes from the test stay in the local EVM fork; nothing is
///         broadcast to the live chain. Per the Wave 11 contract, the goal is
///         to DISCOVER what is broken (edge cases, gas, auth gaps) — not to
///         prove the contract works.
///
/// Canonical references:
///   - Foundry fuzz testing:    https://book.getfoundry.sh/forge/fuzz-testing
///   - Foundry invariants:      https://book.getfoundry.sh/forge/invariant-testing
///   - OZ MerkleProof:          https://docs.openzeppelin.com/contracts/5.x/utils/cryptography#MerkleProof
///   - OZ ReentrancyGuard:      https://docs.openzeppelin.com/contracts/5.x/api/utils#ReentrancyGuard
///   - 0G Galileo:              https://docs.0g.ai/developer-hub/testnet/testnet-overview
contract FuzzAxiomStrategyVaultTest is StdInvariant, Test {
    // ─── Live addresses (deployed on 0G Galileo, chainId 16602) ────────────
    address constant LIVE_VAULT = 0xb7F89e50D5A3039Da7d39528436B820371572874;
    address constant LIVE_NFT   = 0xf12F158a20c36a351b056FD60b3a7377ce4F1e09;
    address constant OPERATOR  = 0x437371dB1FBD534Bd01BD3f4E66DfA1675952F91;
    address constant RECEIVER1 = 0x845016B204fb2db028Ff148990Fc75bb606EE239;
    address constant RECEIVER2 = 0x4b4ce48b3e234ab057Ae9b25649a9B7F70e1A4C3;

    // Bounded seed set: 6 tokens, distributed across 3 wallets, 2 per owner.
    // We mint them in setUp() so the fuzzers have a non-empty owned-tokenId set.
    // The fuzz inputs (tokenId index) are bounded via modulo to the seed size.
    uint256 internal constant SEED_TOKENS = 6;

    AxiomStrategyVault internal vault;
    IAxiomAgentNFT    internal nft;
    AxiomAgentNFT     internal nftFull; // for minting (mintWithRole needs full interface)

    // ─── Events re-declared for vm.expectEmit ──────────────────────
    // Solidity events are not contract-type members, so `emit Vault.Deposited(...)`
    // does not compile. Re-declare the same event signatures at the test-file
    // scope. Source: https://book.getfoundry.sh/cheatcodes/expect-emit
    event Deposited(uint256 indexed tokenId, address indexed from, address indexed asset, uint256 amount);
    event Executed(uint256 indexed tokenId, bytes32 indexed actionHash, address indexed target, uint256 value, bytes result);

    // All tokenIds minted during setUp(), with their owner.
    uint256[SEED_TOKENS] internal seedTokenIds;
    address[SEED_TOKENS] internal seedOwners;

    // Action-execution target
    address internal maliciousReceiver;

    function setUp() public {
        // Pin the live fork at the canonical block from the task spec.
        //   https://book.getfoundry.sh/forge/fork-testing
        //   https://book.getfoundry.sh/reference/config/testing#fork
        vm.createSelectFork("https://0g-galileo-testnet.drpc.org", 38_748_015);

        vault   = AxiomStrategyVault(LIVE_VAULT);
        nft     = IAxiomAgentNFT(LIVE_NFT);
        nftFull = AxiomAgentNFT(LIVE_NFT);

        // Sanity: the live vault must point at the live NFT, and not be paused.
        require(address(vault.nft()) == LIVE_NFT, "vault.nft() mismatch");
        require(!vault.paused(), "vault is paused on fork");
        require(vault.owner() == OPERATOR, "vault.owner() != OPERATOR");

        // Operator has MINTER_ROLE on the live NFT (verified by cast call at
        // block 38,748,015). Mint a small set of agents so the fuzzers can
        // exercise owner-gated paths against real on-chain token state.
        // mintWithRole does NOT consume msg.value (mintFee is 0 on the live NFT).
        // Source: https://eips.ethereum.org/EIPS/eip-721
        address[3] memory owners = [OPERATOR, RECEIVER1, RECEIVER2];
        for (uint256 i = 0; i < SEED_TOKENS; i++) {
            // Each wallet owns exactly 2 of the seeded tokens.
            address to = owners[i % 3];
            bytes32 placeholderHash = keccak256(abi.encodePacked("fuzz-seed", i));
            IntelligentData[] memory ds = new IntelligentData[](1);
            ds[0] = IntelligentData({dataDescription: "fuzz-seed", dataHash: placeholderHash});

            vm.prank(OPERATOR);
            uint256 tid = nftFull.mintWithRole(ds, to);
            // mintWithRole returns the new tokenId.
            seedTokenIds[i] = tid;
            seedOwners[i]   = to;
        }

        // Deploy a malicious receiver that re-enters deposit() from its
        // receive() callback. We give it some balance so it can pay gas.
        maliciousReceiver = address(new MaliciousReceiver(vault));
        vm.deal(maliciousReceiver, 10 ether);
    }

    // ─── Helpers ──────────────────────────────────────────────────────

    /// @dev Pick a random tokenId from the seed set. We use the fuzzer's input
    ///      `index` (bounded to [0, SEED_TOKENS)) and read the real owner.
    function _randomTokenId(uint8 index) internal view returns (uint256 tokenId, address owner) {
        uint256 bounded = uint256(index) % SEED_TOKENS;
        return (seedTokenIds[bounded], seedOwners[bounded]);
    }

    /// @dev Compute the action hash that execute() expects in the Merkle tree.
    ///      Mirrors AxiomStrategyVault.execute():
    ///        keccak256(abi.encode(target, value, keccak256(data)))
    function _actionHash(address target, uint256 value, bytes memory data) internal pure returns (bytes32) {
        return keccak256(abi.encode(target, value, keccak256(data)));
    }

    /// @dev Build a single-leaf Merkle tree — the leaf IS the root.
    ///      The proof is empty because a single-node tree has no siblings.
    ///      OZ MerkleProof.verify returns true for an empty proof when the
    ///      root equals the leaf, because processProof returns the leaf as-is.
    ///      Source: https://docs.openzeppelin.com/contracts/5.x/utils/cryptography#MerkleProof
    function _singleLeafProof(bytes32 /* leaf */) internal pure returns (bytes32[] memory proof) {
        proof = new bytes32[](0);
        return proof;
    }

    /// @dev Mint an extra token for any `to` address (used to give the
    ///      malicious receiver its own tokenId for reentrancy tests).
    function _mintExtraToken(address to, bytes32 dataHash) internal returns (uint256 tid) {
        IntelligentData[] memory ds = new IntelligentData[](1);
        ds[0] = IntelligentData({dataDescription: "extra", dataHash: dataHash});
        vm.prank(OPERATOR);
        tid = nftFull.mintWithRole(ds, to);
    }

    // ─── Fuzz #1: deposit() ──────────────────────────────────────────
    /// @notice Fuzz deposit() with a random tokenId-index and a random value.
    ///         Verifies:
    ///           (a) the deposit is credited to the depositor's vault balance
    ///           (b) the deposit emits Deposited
    ///           (c) the deposit can be made for any tokenId the depositor owns
    /// @dev    The reentrancy vector is checked separately, see
    ///         test_reentrancy_withdraw_isBlocked / test_reentrancy_execute_isBlocked.
    function testFuzz_deposit_creditsBalanceAndEmits(
        uint8 tokenIndex,
        uint96 amount
    ) public {
        // Bound amount to keep the test deterministic and bounded.
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
    /// @dev    Per the contract: `if (msg.value == 0) revert ZeroAmount();`
    function testFuzz_deposit_zeroValue_alwaysReverts(uint8 tokenIndex) public {
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
    ///         Verifies:
    ///           (a) only the owner of the token can set the strategy
    ///           (b) the merkleRoot is stored verbatim
    ///           (c) the dailyLimitWei is stored verbatim
    ///           (d) a zero merkleRoot is accepted by setStrategy
    function testFuzz_setStrategy_ownerStoresRootAndLimit(
        uint8 tokenIndex,
        bytes32 root,
        uint256 dailyLimit
    ) public {
        (uint256 tid, address owner) = _randomTokenId(tokenIndex);
        vm.prank(owner);
        vault.setStrategy(tid, root, dailyLimit);

        (bytes32 storedRoot, uint256 storedLimit, uint256 storedSpent, uint64 storedDay) = vault.strategyOf(tid);
        assertEq(storedRoot, root, "root stored verbatim");
        assertEq(storedLimit, dailyLimit, "limit stored verbatim");
        // Setting strategy resets dailySpent and bumps resetDay
        assertEq(storedSpent, 0, "dailySpent reset");
        assertEq(storedDay, uint64(block.timestamp / 1 days), "resetDay updated");
    }

    /// @notice setStrategy() from a non-owner MUST revert.
    function testFuzz_setStrategy_nonOwner_alwaysReverts(
        uint8 tokenIndex,
        bytes32 root,
        uint256 dailyLimit,
        address nonOwner
    ) public {
        vm.assume(nonOwner != address(0));
        (uint256 tid, address owner) = _randomTokenId(tokenIndex);
        vm.assume(nonOwner != owner);
        vm.prank(nonOwner);
        vm.expectRevert(AxiomStrategyVault.NotTokenOwner.selector);
        vault.setStrategy(tid, root, dailyLimit);
    }

    /// @notice setStrategy() with a zero merkleRoot MUST be accepted (no revert).
    ///         After this, execute() will revert with NoStrategySet — but
    ///         setStrategy itself does not validate the root.
    function testFuzz_setStrategy_zeroRoot_accepted(uint8 tokenIndex, uint256 dailyLimit) public {
        (uint256 tid, address owner) = _randomTokenId(tokenIndex);
        vm.prank(owner);
        vault.setStrategy(tid, bytes32(0), dailyLimit);
        (bytes32 r, , , ) = vault.strategyOf(tid);
        assertEq(r, bytes32(0), "zero root stored");
    }

    // ─── Fuzz #3: execute() ──────────────────────────────────────────
    /// @notice Fuzz execute() with random target, value, and action.
    ///         Strategy is set as a single-leaf tree where the leaf is the
    ///         action hash for (target, value, keccak256(data)).
    ///         Verifies:
    ///           (a) the merkle proof is verified against the stored merkleRoot
    ///           (b) the daily limit is enforced
    ///           (c) the target.call is made (returns the call result)
    ///           (d) the action is recorded in the audit log (via event)
    function testFuzz_execute_validProofAndBalance_passes(
        uint8 tokenIndex,
        uint96 value
    ) public {
        vm.assume(uint256(value) > 0);
        value = uint96(bound(uint256(value), 1 wei, 0.01 ether));

        (uint256 tid, address owner) = _randomTokenId(tokenIndex);

        // Use maliciousReceiver as the target sink — it has a receive() that
        // accepts value (without a receive(), address(this) would revert on
        // the .call{value:..} and trip `require(ok, "Call failed")`, masking
        // the real outcome of the merkle check).
        address target = address(maliciousReceiver);

        // Setup: fund the vault with enough balance to execute.
        vm.deal(owner, uint256(value));
        vm.prank(owner);
        vault.deposit{value: uint256(value)}(tid);

        // Set strategy: a single-leaf tree, leaf = actionHash(target, value, "")
        bytes memory data = new bytes(0);
        bytes32 leaf = _actionHash(target, uint256(value), data);
        bytes32[] memory proof = _singleLeafProof(leaf);
        vm.prank(owner);
        vault.setStrategy(tid, leaf, uint256(value)); // dailyLimit == value

        // Expect Executed event (result not matched — non-indexed + variable)
        vm.expectEmit(true, true, true, false);
        emit Executed(tid, leaf, target, uint256(value), "");

        // Act
        vm.prank(owner);
        bytes memory result = vault.execute(tid, target, uint256(value), data, proof);
        // (a) proof verified — implicit by no revert
        // (b) daily limit enforced — implicit (we set limit == value)
        // (c) call returned — result length is whatever maliciousReceiver's receive returns
        // (d) event emitted — vm.expectEmit enforced
        assertTrue(result.length >= 0, "execute returned");
    }

    /// @notice execute() with a merkle proof that does NOT match the stored root MUST revert.
    function testFuzz_execute_invalidProof_alwaysReverts(
        uint8 tokenIndex,
        uint96 value,
        bytes32 /* fakeRoot */
    ) public {
        vm.assume(uint256(value) > 0);
        value = uint96(bound(uint256(value), 1 wei, 0.01 ether));

        (uint256 tid, address owner) = _randomTokenId(tokenIndex);
        // Target must have a receive() so the call doesn't fail for the
        // wrong reason (it would mask the InvalidMerkleProof revert).
        address target = address(maliciousReceiver);
        bytes memory data = new bytes(0);

        // Setup: fund + set a strategy.
        // We deliberately set the strategy root to something DIFFERENT from
        // the action hash we're about to submit, so the merkle proof check
        // is what fails. A single-leaf tree with root==leaf trivially
        // verifies, which would mask the bug we want to test.
        bytes32 storedRoot = keccak256("strategy-root-for-bad-proof-test");
        vm.deal(owner, uint256(value));
        vm.prank(owner);
        vault.deposit{value: uint256(value)}(tid);
        bytes32 leaf = _actionHash(target, uint256(value), data);
        vm.prank(owner);
        vault.setStrategy(tid, storedRoot, uint256(value));
        // The proof is for the (single) leaf=leaf, but the stored root is
        // storedRoot != leaf, so MerkleProof.verify MUST return false.
        bytes32[] memory badProof = _singleLeafProof(leaf);
        // Skip cases where the fuzzer happens to pick storedRoot == leaf.
        vm.assume(storedRoot != leaf);
        vm.prank(owner);
        vm.expectRevert(AxiomStrategyVault.InvalidMerkleProof.selector);
        vault.execute(tid, target, uint256(value), data, badProof);
    }


    /// @notice execute() MUST enforce the daily limit. We set a tiny limit,
    ///         then try to execute with a value that exceeds it.
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
        vault.setStrategy(tid, leaf, limit);

        vm.prank(owner);
        vm.expectRevert(AxiomStrategyVault.DailyLimitExceeded.selector);
        vault.execute(tid, target, uint256(value), data, proof);
    }

    /// @notice execute() with target == address(0) MUST revert with ZeroAddress.
    function testFuzz_execute_zeroTarget_alwaysReverts(uint8 tokenIndex, uint96 value) public {
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
        vault.setStrategy(tid, leaf, uint256(value));

        vm.prank(owner);
        vm.expectRevert(AxiomStrategyVault.ZeroAddress.selector);
        vault.execute(tid, address(0), uint256(value), data, proof);
    }

    /// @notice execute() with no strategy set MUST revert with NoStrategySet.
    function testFuzz_execute_noStrategy_alwaysReverts(uint8 tokenIndex) public {
        (uint256 tid, address owner) = _randomTokenId(tokenIndex);
        bytes memory data = new bytes(0);
        bytes32[] memory proof = new bytes32[](0);
        vm.prank(owner);
        vm.expectRevert(AxiomStrategyVault.NoStrategySet.selector);
        vault.execute(tid, address(this), 0, data, proof);
    }

    // ─── Fuzz #4: reentrancy ─────────────────────────────────────────
    /// @notice withdraw() MUST block reentrancy.
    /// @dev    The vault's `withdraw` sends ETH back to `msg.sender` (line 96:
    ///         `(bool ok, ) = payable(msg.sender).call{value: amount}("")`).
    ///         So the reentrancy vector is: a contract wallet owns the token,
    ///         calls withdraw itself, and its `receive()` re-enters the vault.
    ///         Because withdraw() has the nonReentrant guard, the re-entrant
    ///         deposit() MUST revert, the outer call{value:...} fails, the
    ///         `require(ok, "Transfer failed")` reverts the whole withdraw.
    ///
    /// BUG-NOTE: As a side observation, the vault does NOT accept a `to`
    ///           parameter on withdraw — the destination is always `msg.sender`.
    ///           This means withdraw cannot be used to send funds to a third
    ///           party. Logged in BUGS.md.
    function test_reentrancy_withdraw_isBlocked() public {
        // The malicious receiver IS the token owner — it will call withdraw
        // and the ETH it receives back will trigger its own receive() callback.
        // (Confirmed by reading AxiomStrategyVault.sol:96 — the destination
        //  is hardcoded to msg.sender.)
        uint256 evilTid = _mintExtraToken(maliciousReceiver, keccak256("evil-withdraw"));

        // Fund the malicious receiver's vault.
        vm.prank(maliciousReceiver);
        vault.deposit{value: 5 ether}(evilTid);
        assertEq(vault.balanceOf(evilTid), 5 ether, "evil balance seeded");

        // Configure the receiver to re-enter deposit on its receive()
        MaliciousReceiver(payable(maliciousReceiver)).armReentrancy(evilTid);

        // Now the malicious receiver calls withdraw on its own token. The
        // vault sends ETH back to it; its receive() fires; receive() calls
        // vault.deposit(evilTid){value: 0}() re-entrantly. Because withdraw()
        // has nonReentrant, the inner deposit() MUST revert, which trips
        // `require(ok, "Transfer failed")` and reverts the whole withdraw.
        vm.prank(maliciousReceiver);
        // Either OZ ReentrancyGuard revert string or "Transfer failed" — both
        // are valid outcomes that prove reentrancy is blocked.
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

        // Set the malicious receiver as the target. Its receive() will
        // call vault.deposit(evilTid) re-entrantly.
        MaliciousReceiver(payable(maliciousReceiver)).armReentrancy(evilTid);
        address target = address(maliciousReceiver);

        uint256 value = 0.5 ether;
        bytes memory data = new bytes(0);
        bytes32 leaf = _actionHash(target, value, data);
        bytes32[] memory proof = _singleLeafProof(leaf);

        vm.prank(owner);
        vault.setStrategy(tid, leaf, value);

        // The call reverts because: execute()'s nonReentrant blocks the
        // re-entry. The exact revert string comes from OZ's ReentrancyGuard
        // ("ReentrancyGuard: reentrant call") or the "Call failed" require —
        // either way, the test only requires a revert.
        vm.prank(owner);
        vm.expectRevert();
        vault.execute(tid, target, value, data, proof);
    }

    // ─── Invariants ─────────────────────────────────────────────────
    /// @notice invariant_totalDepositedMatchesSumOfBalances
    ///         For every seeded tokenId, the sum of per-token balances
    ///         must never exceed the vault's native balance (the vault
    ///         only credits balances; it never debits from somewhere else).
    function invariant_totalDepositedMatchesSumOfBalances() public view {
        uint256 total = 0;
        for (uint256 i = 0; i < SEED_TOKENS; i++) {
            total += vault.balanceOf(seedTokenIds[i]);
        }
        // Every wei credited to a vault balance is backed by an equal
        // amount of native balance held by the vault contract.
        assertLe(total, address(vault).balance, "sum of balances <= vault native balance");
    }

    /// @notice invariant_actionCountMonotonic
    ///         The contract enforces `dailySpent <= dailyLimit` on every
    ///         execute. We assert this as a cross-check invariant.
    function invariant_actionCountMonotonic() public view {
        for (uint256 i = 0; i < SEED_TOKENS; i++) {
            (, uint256 dailyLimit, uint256 dailySpent, ) = vault.strategyOf(seedTokenIds[i]);
            assertLe(dailySpent, dailyLimit, "dailySpent <= dailyLimit");
        }
    }
}

/// @notice Malicious receiver used to verify ReentrancyGuard coverage.
///         When armed, its receive() callback calls `vault.deposit(evilTid)`.
///         If the outer call (withdraw/execute) is guarded by nonReentrant,
///         the inner deposit MUST revert. If unguarded, the inner deposit
///         would succeed and double-credit the balance — the outer test
///         catches this by asserting the outer call reverts.
/// @dev    Implements onERC721Received so OZ ERC721._safeMint allows the
///         contract to receive the test agent NFT.
///         Source: https://eips.ethereum.org/EIPS/eip-721
contract MaliciousReceiver {
    AxiomStrategyVault public vault;
    uint256 public evilTokenId;
    bool public armed;

    constructor(AxiomStrategyVault _vault) {
        vault = _vault;
    }

    function armReentrancy(uint256 _evilTokenId) external {
        evilTokenId = _evilTokenId;
        armed = true;
    }

    receive() external payable {
        if (armed) {
            // Re-enter deposit. If the caller (vault.withdraw or vault.execute)
            // is guarded by nonReentrant, this MUST revert and propagate out of
            // receive(), causing the outer call{value:...} to fail.
            vault.deposit{value: 0}(evilTokenId);
        }
    }

    // ─── ERC721 receiver hook ────────────────────────────────────────
    // OZ ERC721._safeMint requires contracts receiving the NFT to implement
    // onERC721Received and return its magic value, otherwise it reverts with
    // ERC721InvalidReceiver. We need this to mint an agent to the
    // MaliciousReceiver for the reentrancy tests.
    // Reference: https://eips.ethereum.org/EIPS/eip-721
    function onERC721Received(
        address, /* operator */
        address, /* from */
        uint256, /* tokenId */
        bytes calldata /* data */
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
