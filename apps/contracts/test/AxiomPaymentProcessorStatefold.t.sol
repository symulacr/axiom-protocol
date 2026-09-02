// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {AxiomStrategyVault} from "../src/AxiomStrategyVault.sol";
import {IAxiomAgentNFT} from "../src/interfaces/IAxiomAgentNFT.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC7857Metadata} from "@0g-agent-nft/interfaces/IERC7857Metadata.sol";

contract StatefoldMockERC20 is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}

    function mint(
        address to,
        uint256 amount
    ) external {
        _mint(to, amount);
    }
}

/// @dev Stand-in NFT with just enough surface for the ported views: creatorOf/ownerOf plus a
///      realistic `intelligentDatasOf` return shape ((string,bytes32)[] tuples — NOT parallel
///      arrays), which verifyPayloadOf decodes through the typed ERC-7857 interface.
contract StatefoldMockNFT is IAxiomAgentNFT {
    struct IntelligentData {
        string dataDescription;
        bytes32 dataHash;
    }

    mapping(uint256 => address) internal _creators;
    mapping(uint256 => address) internal _owners;
    mapping(uint256 => IntelligentData[]) internal _iDatas;

    function setCreator(
        uint256 tokenId,
        address creator
    ) external {
        _creators[tokenId] = creator;
    }

    function setOwner(
        uint256 tokenId,
        address owner_
    ) external {
        _owners[tokenId] = owner_;
    }

    function setIData(
        uint256 tokenId,
        string calldata description,
        bytes32 dataHash
    ) external {
        _iDatas[tokenId].push(IntelligentData(description, dataHash));
    }

    function creatorOf(
        uint256 tokenId
    ) external view override returns (address) {
        return _creators[tokenId];
    }

    function ownerOf(
        uint256 tokenId
    ) external view override returns (address) {
        return _owners[tokenId];
    }

    function intelligentDatasOf(
        uint256 tokenId
    ) external view returns (IntelligentData[] memory) {
        return _iDatas[tokenId];
    }
}

/// @dev Tests for the V3 W4 statefold views ported from the deleted AxiomStateView facade
///      (royaltyRecipientOf, effectiveRoyaltyBpsOf, vaultHealthOf, verifyPayloadOf,
///      paymentSnapshot) plus the setAxiomVault admin setter.
contract AxiomPaymentProcessorStatefoldTest is Test {
    AxiomPaymentProcessor internal processor;
    AxiomStrategyVault internal vault;
    StatefoldMockERC20 internal token;
    StatefoldMockNFT internal nft;

    address internal owner = address(0x0A11CE);
    address internal treasury = address(0x0A1D);
    address internal creator = address(0xC0FFEE);
    address internal payer = address(0xBA7A);

    uint256 internal constant AGENT_TOKEN_ID = 1;
    uint256 internal constant PROTOCOL_FEE_BPS = 250; // 2.5%
    uint64 internal constant NO_EXPIRY = 0;

    function setUp() public {
        token = new StatefoldMockERC20();
        nft = new StatefoldMockNFT();
        nft.setCreator(AGENT_TOKEN_ID, creator);
        nft.setOwner(AGENT_TOKEN_ID, payer);

        AxiomPaymentProcessor procImpl = new AxiomPaymentProcessor();
        ERC1967Proxy procProxy = new ERC1967Proxy(
            address(procImpl),
            abi.encodeWithSelector(
                procImpl.initialize.selector, address(nft), address(token), treasury, PROTOCOL_FEE_BPS, owner
            )
        );
        processor = AxiomPaymentProcessor(address(procProxy));

        AxiomStrategyVault vaultImpl = new AxiomStrategyVault();
        ERC1967Proxy vaultProxy = new ERC1967Proxy(
            address(vaultImpl),
            abi.encodeWithSelector(vaultImpl.initialize.selector, IAxiomAgentNFT(address(nft)), owner)
        );
        vault = AxiomStrategyVault(payable(address(vaultProxy)));

        vm.prank(owner);
        processor.setAxiomVault(address(vault));
    }

    // ─── setAxiomVault ─────────────────────────────────────────────

    function test_setAxiomVault_setsAndEmits() public {
        AxiomStrategyVault other = AxiomStrategyVault(payable(makeAddr("otherVault")));
        vm.expectEmit(true, true, false, true);
        emit AxiomPaymentProcessor.VaultAddressUpdated(address(vault), address(other));
        vm.prank(owner);
        processor.setAxiomVault(address(other));
        assertEq(processor.axiomVault(), address(other));
    }

    function test_setAxiomVault_onlyAdmin() public {
        // hoist the role read: it would otherwise consume the vm.prank below
        bytes32 adminRole = processor.ADMIN_ROLE();
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, payer, adminRole)
        );
        processor.setAxiomVault(address(vault));
    }

    // ─── royaltyRecipientOf ────────────────────────────────────────

    function test_royaltyRecipientOf_returnsCreator() public view {
        assertEq(processor.royaltyRecipientOf(AGENT_TOKEN_ID), creator);
    }

    /// Zero-creator semantics: an unregistered token yields address(0), NOT a revert —
    /// callers treat zero as "no royalty recipient" (the write path reverts
    /// AgentCreatorNotRegistered; the view surfaces the same fact as zero).
    function test_royaltyRecipientOf_zeroForUnknownToken() public view {
        assertEq(processor.royaltyRecipientOf(999), address(0));
    }

    // ─── effectiveRoyaltyBpsOf ─────────────────────────────────────

    function test_effectiveRoyaltyBpsOf_unsetMirrorsProcessorSentinel() public view {
        (uint256 royaltyBps, bool isSet, uint256 protocolFeeBps) = processor.effectiveRoyaltyBpsOf(AGENT_TOKEN_ID);
        assertEq(royaltyBps, processor.royaltyBpsOf(AGENT_TOKEN_ID));
        assertEq(royaltyBps, 0);
        assertFalse(isSet);
        assertFalse(processor.royaltyBpsSet(AGENT_TOKEN_ID));
        assertEq(protocolFeeBps, PROTOCOL_FEE_BPS);
    }

    function test_effectiveRoyaltyBpsOf_setValueMatchesProcessor() public {
        vm.prank(creator);
        processor.setRoyaltyBps(AGENT_TOKEN_ID, 4000); // 40%, max royalty = 97.5%

        (uint256 royaltyBps, bool isSet,) = processor.effectiveRoyaltyBpsOf(AGENT_TOKEN_ID);
        assertEq(royaltyBps, processor.royaltyBpsOf(AGENT_TOKEN_ID));
        assertEq(royaltyBps, 4000);
        assertTrue(isSet);
    }

    /// Clamp parity: a royalty above (BPS_DENOMINATOR - protocolFeeBps) would be rejected by
    /// setRoyaltyBps, so the only way stored exceeds maxRoyalty is a protocolFeeBps raise AFTER
    /// a set — assert the view returns the same clamped bps as Processor.royaltyBpsOf.
    function test_effectiveRoyaltyBpsOf_clampParityAfterFeeRaise() public {
        vm.prank(creator);
        processor.setRoyaltyBps(AGENT_TOKEN_ID, 8000); // 80% under 2.5% fee
        vm.prank(owner);
        processor.setProtocolFeeBps(4000); // fee raised to 40% → maxRoyalty 60%

        (uint256 royaltyBps, bool isSet,) = processor.effectiveRoyaltyBpsOf(AGENT_TOKEN_ID);
        assertEq(royaltyBps, processor.royaltyBpsOf(AGENT_TOKEN_ID));
        assertEq(royaltyBps, 6000); // clamped to BPS_DENOMINATOR - 4000
        assertTrue(isSet);
    }

    // ─── vaultHealthOf ─────────────────────────────────────────────

    function test_vaultHealthOf_emptyVault() public view {
        (
            uint256 balance,
            bytes32 strategyRoot,
            uint128 dailyLimit,
            uint128 dailySpent,
            uint64 resetDay,
            uint64 validUntilDay,
            bool expired
        ) = processor.vaultHealthOf(AGENT_TOKEN_ID);
        assertEq(balance, 0);
        assertEq(strategyRoot, bytes32(0));
        assertEq(dailyLimit, 0);
        assertEq(dailySpent, 0);
        assertEq(resetDay, 0);
        assertEq(validUntilDay, 0);
        assertFalse(expired); // 0 sentinel = no expiry
    }

    function test_vaultHealthOf_activeStrategyNotExpired() public {
        uint64 today = uint64(block.timestamp / 1 days);
        vm.prank(payer);
        vault.setStrategy(AGENT_TOKEN_ID, keccak256("strategy"), 1 ether, today + 10);

        (
            ,
            bytes32 strategyRoot,
            uint128 dailyLimit,
            uint128 dailySpent,
            uint64 resetDay,
            uint64 validUntilDay,
            bool expired
        ) = processor.vaultHealthOf(AGENT_TOKEN_ID);
        assertEq(strategyRoot, keccak256("strategy"));
        assertEq(dailyLimit, 1 ether);
        assertEq(dailySpent, 0);
        assertEq(resetDay, today);
        assertEq(validUntilDay, today + 10);
        assertFalse(expired);
    }

    /// Expired parity: same predicate as execute()'s StrategyExpired check
    /// (validUntilDay != 0 && today > validUntilDay) — warp one day past the window.
    /// Warp past day 0 first: validUntilDay == 0 is the "no expiry" sentinel.
    function test_vaultHealthOf_expiredAfterValidUntil() public {
        vm.warp(100 days);
        uint64 today = uint64(block.timestamp / 1 days);
        vm.prank(payer);
        vault.setStrategy(AGENT_TOKEN_ID, keccak256("strategy"), 1 ether, today); // expires end of today

        (,,,,,, bool expiredBefore) = processor.vaultHealthOf(AGENT_TOKEN_ID);
        assertFalse(expiredBefore);

        vm.warp((uint256(today) + 1) * 1 days); // 00:00 UTC next day → window passed
        (,,,,,, bool expiredAfter) = processor.vaultHealthOf(AGENT_TOKEN_ID);
        assertTrue(expiredAfter);
    }

    function test_vaultHealthOf_balanceAndSpendTracked() public {
        vm.deal(payer, 2 ether);
        vm.prank(payer);
        vault.depositAndSetStrategy{value: 1.5 ether}(AGENT_TOKEN_ID, keccak256("s"), 1 ether, NO_EXPIRY);

        (uint256 balance,, uint128 dailyLimit, uint128 dailySpent,,, bool expired) =
            processor.vaultHealthOf(AGENT_TOKEN_ID);
        assertEq(balance, 1.5 ether);
        assertEq(dailyLimit, 1 ether);
        assertEq(dailySpent, 0);
        assertFalse(expired);
    }

    function test_vaultHealthOf_revertsWhenVaultUnconfigured() public {
        vm.prank(owner);
        processor.setAxiomVault(address(0)); // un-wire
        vm.expectRevert(AxiomPaymentProcessor.VaultNotConfigured.selector);
        processor.vaultHealthOf(AGENT_TOKEN_ID);
    }

    // ─── verifyPayloadOf ───────────────────────────────────────────

    function test_verifyPayloadOf_trueOnMatchingPayload() public {
        bytes memory payload = bytes("agent memory blob v1");
        nft.setIData(AGENT_TOKEN_ID, "description", keccak256(payload));

        assertTrue(processor.verifyPayloadOf(AGENT_TOKEN_ID, 0, payload));
    }

    function test_verifyPayloadOf_falseOnMismatchedPayload() public {
        bytes memory payload = bytes("agent memory blob v1");
        nft.setIData(AGENT_TOKEN_ID, "description", keccak256(payload));

        assertFalse(processor.verifyPayloadOf(AGENT_TOKEN_ID, 0, bytes("tampered blob")));
        assertFalse(processor.verifyPayloadOf(AGENT_TOKEN_ID, 0, ""));
    }

    /// A stored bytes32(0) dataHash can never match any payload (keccak256 never returns 0) —
    /// documented trap: a zero hash must never be read as "verified".
    function test_verifyPayloadOf_zeroStoredHashNeverVerifies() public {
        nft.setIData(AGENT_TOKEN_ID, "description", bytes32(0));
        assertFalse(processor.verifyPayloadOf(AGENT_TOKEN_ID, 0, ""));
        assertFalse(processor.verifyPayloadOf(AGENT_TOKEN_ID, 0, "x"));
    }

    // ─── paymentSnapshot ───────────────────────────────────────────

    function test_paymentSnapshot_fullPreFlight() public {
        vm.prank(owner);
        processor.setMaxPayCap(700e6);
        vm.prank(owner);
        processor.setComputeRatioMax(2);

        uint256 balance = 1000e6;
        token.mint(payer, balance);
        vm.prank(payer);
        token.approve(address(processor), 400e6);

        (
            uint256 maxPayCap,
            uint256 computeRatioMax,
            uint256 agentBalance,
            uint256 payerAllowance,
            address paymentToken
        ) = processor.paymentSnapshot(payer, AGENT_TOKEN_ID);

        assertEq(maxPayCap, 700e6);
        assertEq(computeRatioMax, 2);
        assertEq(agentBalance, balance);
        assertEq(payerAllowance, 400e6);
        assertEq(paymentToken, address(token));
    }
}
