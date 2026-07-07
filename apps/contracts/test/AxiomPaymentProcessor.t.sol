// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {IAxiomAgentNFT} from "../src/interfaces/IAxiomAgentNFT.sol";

/// @dev Minimal ERC-20 used in the processor tests. Wraps OZ's ERC20 so we exercise the
///      real OZ code path that the production payment token (USDC.e / USDG) uses.
contract MockERC20 is ERC20 {
    constructor(
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) {}

    function mint(
        address to,
        uint256 amount
    ) external {
        _mint(to, amount);
    }
}

/// @dev ERC-20 that burns 1% on every transfer to simulate fee-on-transfer behavior.
contract MockFeeOnTransferERC20 is ERC20 {
    uint256 public constant FEE_BPS = 100;

    constructor() ERC20("Fee Token", "FEE") {}

    function mint(
        address to,
        uint256 amount
    ) external {
        _mint(to, amount);
    }

    function _update(
        address from,
        address to,
        uint256 value
    ) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = (value * FEE_BPS) / 10_000;
            if (fee > 0) {
                super._update(from, address(0), fee);
                value -= fee;
            }
        }
        super._update(from, to, value);
    }
}

/// @dev Minimal stand-in for AxiomAgentNFT: returns a hardcoded creator for a tokenId so the
///      payment processor can resolve it. Only `creatorOf` is exercised by these tests; the
///      real NFT contract is verified in AxiomAgentNFT.t.sol and is untouched here.
contract MockAxiomAgentNFT is IAxiomAgentNFT {
    mapping(uint256 => address) internal _creators;
    mapping(uint256 => address) internal _owners;

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
}

contract AxiomPaymentProcessorTest is Test {
    AxiomPaymentProcessor internal processor;
    MockERC20 internal token;
    MockAxiomAgentNFT internal nft;

    address internal owner = address(0x0A11CE);
    address internal treasury = address(0x0A1D);
    address internal creator = address(0xC0FFEE);
    address internal payer = address(0xBA7A);

    uint256 internal constant AGENT_TOKEN_ID = 1;
    uint256 internal constant PROTOCOL_FEE_BPS = 250; // 2.5%

    event PaymentProcessed(
        uint256 indexed agentTokenId,
        address indexed payer,
        address indexed creator,
        uint256 amount,
        uint256 creatorCut,
        uint256 protocolCut
    );
    event EarningsWithdrawn(address indexed creator, uint256 amount);
    event ProtocolTreasuryProposed(address indexed proposedTreasury, uint256 effectiveAt);
    event ProtocolTreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event ProtocolTreasuryProposalCancelled(address indexed pendingTreasury);

    function setUp() public {
        token = new MockERC20("Mock USDC", "mUSDC");
        nft = new MockAxiomAgentNFT();
        nft.setCreator(AGENT_TOKEN_ID, creator);
        processor = new AxiomPaymentProcessor(address(nft), address(token), treasury, PROTOCOL_FEE_BPS, owner);
    }

    // ─── payForAgent ───────────────────────────────────────────────
    function test_payForAgent_creditsCreatorAndTransfersToken() public {
        uint256 amount = 1000e6;
        uint256 expectedProtocolCut = (amount * PROTOCOL_FEE_BPS) / 10_000;
        uint256 expectedCreatorCut = amount - expectedProtocolCut;

        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(address(processor), amount);

        assertEq(token.balanceOf(payer), amount, "payer pre-balance");
        assertEq(token.balanceOf(address(processor)), 0, "processor pre-balance");
        assertEq(token.balanceOf(treasury), 0, "treasury pre-balance");
        assertEq(processor.agentEarningsOf(creator), 0, "creator pre-earnings");
        assertEq(processor.totalOutstandingEarnings(), 0, "no outstanding earnings");

        vm.expectEmit(true, true, true, true);
        emit PaymentProcessed(AGENT_TOKEN_ID, payer, creator, amount, expectedCreatorCut, expectedProtocolCut);

        vm.prank(payer);
        processor.payForAgent(AGENT_TOKEN_ID, amount);

        assertEq(token.balanceOf(payer), 0, "payer post-balance");
        assertEq(token.balanceOf(address(processor)), expectedCreatorCut, "processor post-balance");
        assertEq(token.balanceOf(treasury), expectedProtocolCut, "treasury post-balance");
        assertEq(processor.agentEarningsOf(creator), expectedCreatorCut, "creator post-earnings");
        assertEq(processor.totalOutstandingEarnings(), expectedCreatorCut, "outstanding earnings tracked");
    }

    function test_payForAgent_revertsWhenNotApproved() public {
        uint256 amount = 100e6;
        token.mint(payer, amount);

        vm.expectRevert();
        vm.prank(payer);
        processor.payForAgent(AGENT_TOKEN_ID, amount);

        assertEq(processor.agentEarningsOf(creator), 0, "earnings unchanged on revert");
        assertEq(processor.totalOutstandingEarnings(), 0, "outstanding unchanged on revert");
    }

    function test_payForAgent_revertsOnFeeOnTransferToken() public {
        MockFeeOnTransferERC20 feeToken = new MockFeeOnTransferERC20();
        AxiomPaymentProcessor feeProcessor =
            new AxiomPaymentProcessor(address(nft), address(feeToken), treasury, PROTOCOL_FEE_BPS, owner);

        uint256 amount = 1000e6;
        feeToken.mint(payer, amount);
        vm.prank(payer);
        feeToken.approve(address(feeProcessor), amount);

        vm.expectRevert(
            abi.encodeWithSelector(AxiomPaymentProcessor.TransferAmountMismatch.selector, amount, amount * 99 / 100)
        );
        vm.prank(payer);
        feeProcessor.payForAgent(AGENT_TOKEN_ID, amount);
    }

    function test_payForAgent_revertsWhenCreatorNotRegistered() public {
        uint256 unregisteredTokenId = 999;
        uint256 amount = 100e6;
        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(address(processor), amount);

        vm.expectRevert(AxiomPaymentProcessor.AgentCreatorNotRegistered.selector);
        vm.prank(payer);
        processor.payForAgent(unregisteredTokenId, amount);
    }

    function test_payForAgent_explicitZeroRoyalty() public {
        uint256 amount = 1000e6;

        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(address(processor), amount);

        vm.prank(creator);
        processor.setRoyaltyBps(AGENT_TOKEN_ID, 0);
        assertTrue(processor.royaltyBpsSet(AGENT_TOKEN_ID), "royalty marked as set");
        assertEq(processor.royaltyBpsOf(AGENT_TOKEN_ID), 0, "stored royalty is 0");

        vm.expectEmit(true, true, true, true);
        emit PaymentProcessed(AGENT_TOKEN_ID, payer, creator, amount, 0, amount);

        vm.prank(payer);
        processor.payForAgent(AGENT_TOKEN_ID, amount);

        assertEq(processor.agentEarningsOf(creator), 0, "creator earnings stay zero");
        assertEq(processor.totalOutstandingEarnings(), 0, "no outstanding earnings");
        assertEq(token.balanceOf(treasury), amount, "treasury receives full amount");
        assertEq(token.balanceOf(address(processor)), 0, "processor holds no funds");
    }

    // ─── setRoyaltyBps / setRoyaltyBpsPermitted ───────────────────
    function test_setRoyaltyBps_revertsWhenRoyaltyExceedsCap() public {
        AxiomPaymentProcessor cappedProcessor =
            new AxiomPaymentProcessor(address(nft), address(token), treasury, 100, owner);

        vm.prank(creator);
        vm.expectRevert(AxiomPaymentProcessor.InvalidBps.selector);
        cappedProcessor.setRoyaltyBps(AGENT_TOKEN_ID, 10_000);
    }

    function test_setRoyaltyBpsPermitted_revertsWhenOwnerNotCreator() public {
        address nftOwner = address(0xFEED);
        nft.setOwner(AGENT_TOKEN_ID, nftOwner);

        vm.prank(nftOwner);
        vm.expectRevert(AxiomPaymentProcessor.NotCreator.selector);
        processor.setRoyaltyBpsPermitted(AGENT_TOKEN_ID, 5000);
    }

    function test_setRoyaltyBps_acceptsMaxAllowedRoyalty() public {
        uint256 maxRoyalty = 10_000 - PROTOCOL_FEE_BPS;

        vm.prank(creator);
        processor.setRoyaltyBps(AGENT_TOKEN_ID, maxRoyalty);

        assertTrue(processor.royaltyBpsSet(AGENT_TOKEN_ID), "royalty marked as set");
        assertEq(processor.royaltyBpsOf(AGENT_TOKEN_ID), maxRoyalty, "stored royalty at cap");
    }

    function test_payForAgent_capsStoredRoyaltyWhenProtocolFeeIncreases() public {
        uint256 amount = 10_000e6;
        uint256 maxRoyalty = 10_000 - PROTOCOL_FEE_BPS;

        vm.prank(creator);
        processor.setRoyaltyBps(AGENT_TOKEN_ID, maxRoyalty);

        vm.prank(owner);
        processor.setProtocolFeeBps(500);

        uint256 expectedProtocolCut = (amount * 500) / 10_000;
        uint256 expectedCreatorCut = amount - expectedProtocolCut;

        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(address(processor), amount);

        vm.prank(payer);
        processor.payForAgent(AGENT_TOKEN_ID, amount);

        assertEq(processor.agentEarningsOf(creator), expectedCreatorCut, "creator cut capped");
        assertEq(token.balanceOf(treasury), expectedProtocolCut, "protocol receives minimum fee");
    }

    // ─── withdrawAgentEarnings ──────────────────────────────────────
    function test_withdrawAgentEarnings_transfersToken() public {
        uint256 amount = 1000e6;
        uint256 expectedProtocolCut = (amount * PROTOCOL_FEE_BPS) / 10_000;
        uint256 expectedCreatorCut = amount - expectedProtocolCut;

        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(address(processor), amount);
        vm.prank(payer);
        processor.payForAgent(AGENT_TOKEN_ID, amount);

        assertEq(processor.agentEarningsOf(creator), expectedCreatorCut, "earnings pre-withdraw");
        assertEq(processor.totalOutstandingEarnings(), expectedCreatorCut, "outstanding pre-withdraw");
        assertEq(token.balanceOf(creator), 0, "creator pre-token-balance");

        vm.expectEmit(true, false, false, true);
        emit EarningsWithdrawn(creator, expectedCreatorCut);

        vm.prank(creator);
        processor.withdrawAgentEarnings();

        assertEq(token.balanceOf(creator), expectedCreatorCut, "creator post-token-balance");
        assertEq(processor.agentEarningsOf(creator), 0, "earnings post-withdraw");
        assertEq(processor.totalOutstandingEarnings(), 0, "outstanding post-withdraw");
        assertEq(token.balanceOf(address(processor)), 0, "processor post-token-balance");
    }

    function test_withdrawAgentEarnings_revertsOnZero() public {
        vm.expectRevert(AxiomPaymentProcessor.NoEarnings.selector);
        vm.prank(creator);
        processor.withdrawAgentEarnings();
    }

    // ─── setPaymentToken (migration) ────────────────────────────────
    function test_setPaymentToken_ownerCanRotate() public {
        MockERC20 newToken = new MockERC20("Mock USDG", "mUSDG");
        address newTokenAddr = address(newToken);
        vm.prank(owner);
        processor.setPaymentToken(newTokenAddr);

        assertEq(processor.paymentToken(), newTokenAddr, "paymentToken updated");
    }

    function test_setPaymentToken_revertsForNonOwner() public {
        MockERC20 newToken = new MockERC20("Mock USDG", "mUSDG");
        vm.prank(payer);
        vm.expectRevert();
        processor.setPaymentToken(address(newToken));
    }

    function test_setPaymentToken_revertsForZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(AxiomPaymentProcessor.ZeroAddress.selector);
        processor.setPaymentToken(address(0));
    }

    function test_setPaymentToken_revertsWithOutstandingEarnings() public {
        uint256 amount = 1000e6;
        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(address(processor), amount);
        vm.prank(payer);
        processor.payForAgent(AGENT_TOKEN_ID, amount);

        assertGt(processor.agentEarningsOf(creator), 0, "creator has outstanding earnings");

        MockERC20 newToken = new MockERC20("Mock USDG", "mUSDG");
        vm.prank(owner);
        vm.expectRevert(AxiomPaymentProcessor.MigrationBlocked.selector);
        processor.setPaymentToken(address(newToken));
    }

    function test_setPaymentToken_revertsWhenOldTokenBalanceRemains() public {
        uint256 stranded = 50e6;
        token.mint(address(processor), stranded);
        assertEq(token.balanceOf(address(processor)), stranded, "processor holds old token");
        assertEq(processor.agentEarningsOf(creator), 0, "no outstanding earnings");

        MockERC20 newToken = new MockERC20("Mock USDG", "mUSDG");
        vm.prank(owner);
        vm.expectRevert(AxiomPaymentProcessor.MigrationBlocked.selector);
        processor.setPaymentToken(address(newToken));
    }

    function test_setPaymentToken_succeedsAfterDrain() public {
        uint256 amount = 1000e6;
        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(address(processor), amount);
        vm.prank(payer);
        processor.payForAgent(AGENT_TOKEN_ID, amount);

        vm.prank(creator);
        processor.withdrawAgentEarnings();

        MockERC20 newToken = new MockERC20("Mock USDG", "mUSDG");
        vm.prank(owner);
        processor.setPaymentToken(address(newToken));
        assertEq(processor.paymentToken(), address(newToken));
    }

    // ─── protocol treasury timelock ───────────────────────────────────
    function test_proposeProtocolTreasury_emitsEvent() public {
        address newTreasury = address(0xBEEF);
        uint256 expectedEffectiveAt = block.timestamp + processor.TREASURY_TIMELOCK_DELAY();

        vm.expectEmit(true, false, false, true);
        emit ProtocolTreasuryProposed(newTreasury, expectedEffectiveAt);

        vm.prank(owner);
        processor.proposeProtocolTreasury(newTreasury);

        assertEq(processor.pendingProtocolTreasury(), newTreasury);
        assertEq(processor.pendingTreasuryEffectiveAt(), expectedEffectiveAt);
        assertEq(processor.protocolTreasury(), treasury, "active treasury unchanged until execute");
    }

    function test_executeProtocolTreasury_revertsBeforeTimelock() public {
        address newTreasury = address(0xBEEF);
        vm.prank(owner);
        processor.proposeProtocolTreasury(newTreasury);

        vm.prank(owner);
        vm.expectRevert(AxiomPaymentProcessor.TimelockNotExpired.selector);
        processor.executeProtocolTreasury();
    }

    function test_executeProtocolTreasury_updatesAfterDelay() public {
        address newTreasury = address(0xBEEF);
        vm.prank(owner);
        processor.proposeProtocolTreasury(newTreasury);

        vm.warp(block.timestamp + processor.TREASURY_TIMELOCK_DELAY());

        vm.expectEmit(true, true, false, true);
        emit ProtocolTreasuryUpdated(treasury, newTreasury);

        vm.prank(owner);
        processor.executeProtocolTreasury();

        assertEq(processor.protocolTreasury(), newTreasury);
        assertEq(processor.pendingProtocolTreasury(), address(0));
        assertEq(processor.pendingTreasuryEffectiveAt(), 0);
    }

    function test_cancelProtocolTreasuryProposal_clearsPending() public {
        address newTreasury = address(0xBEEF);
        vm.prank(owner);
        processor.proposeProtocolTreasury(newTreasury);

        vm.expectEmit(true, false, false, true);
        emit ProtocolTreasuryProposalCancelled(newTreasury);

        vm.prank(owner);
        processor.cancelProtocolTreasuryProposal();

        assertEq(processor.pendingProtocolTreasury(), address(0));
        assertEq(processor.pendingTreasuryEffectiveAt(), 0);
        assertEq(processor.protocolTreasury(), treasury);
    }

    function test_proposeProtocolTreasury_revertsForZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(AxiomPaymentProcessor.ZeroAddress.selector);
        processor.proposeProtocolTreasury(address(0));
    }

    function test_proposeProtocolTreasury_revertsForNonOwner() public {
        vm.prank(payer);
        vm.expectRevert();
        processor.proposeProtocolTreasury(address(0xBEEF));
    }

    function test_executeProtocolTreasury_revertsWithNoPending() public {
        vm.prank(owner);
        vm.expectRevert(AxiomPaymentProcessor.NoPendingProposal.selector);
        processor.executeProtocolTreasury();
    }

    function test_cancelProtocolTreasuryProposal_revertsWithNoPending() public {
        vm.prank(owner);
        vm.expectRevert(AxiomPaymentProcessor.NoPendingProposal.selector);
        processor.cancelProtocolTreasuryProposal();
    }

    function test_executeProtocolTreasury_revertsForNonOwner() public {
        address newTreasury = address(0xBEEF);
        vm.prank(owner);
        processor.proposeProtocolTreasury(newTreasury);
        vm.warp(block.timestamp + processor.TREASURY_TIMELOCK_DELAY());

        vm.prank(payer);
        vm.expectRevert();
        processor.executeProtocolTreasury();
    }

    function test_proposeProtocolTreasury_overwritesPreviousProposal() public {
        address first = address(0xBEEF);
        address second = address(0xCAFE);

        vm.prank(owner);
        processor.proposeProtocolTreasury(first);
        vm.prank(owner);
        processor.proposeProtocolTreasury(second);

        assertEq(processor.pendingProtocolTreasury(), second);
    }

    function test_executeProtocolTreasury_routesPaymentsToNewTreasury() public {
        address newTreasury = address(0xBEEF);
        uint256 amount = 1000e6;
        uint256 expectedProtocolCut = (amount * PROTOCOL_FEE_BPS) / 10_000;

        vm.prank(owner);
        processor.proposeProtocolTreasury(newTreasury);
        vm.warp(block.timestamp + processor.TREASURY_TIMELOCK_DELAY());
        vm.prank(owner);
        processor.executeProtocolTreasury();

        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(address(processor), amount);
        vm.prank(payer);
        processor.payForAgent(AGENT_TOKEN_ID, amount);

        assertEq(token.balanceOf(newTreasury), expectedProtocolCut, "new treasury received protocol cut");
        assertEq(token.balanceOf(treasury), 0, "old treasury received nothing");
    }
}