// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IAxiomAgentNFT} from "../src/interfaces/IAxiomAgentNFT.sol";
import {TimelockManager} from "../src/libraries/TimelockManager.sol";

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
        AxiomPaymentProcessor impl = new AxiomPaymentProcessor();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeWithSelector(impl.initialize.selector, address(nft), address(token), treasury, PROTOCOL_FEE_BPS, owner)
        );
        processor = AxiomPaymentProcessor(address(proxy));
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
        AxiomPaymentProcessor feeProcessorImpl = new AxiomPaymentProcessor();
        ERC1967Proxy feeProxy = new ERC1967Proxy(
            address(feeProcessorImpl),
            abi.encodeWithSelector(feeProcessorImpl.initialize.selector, address(nft), address(feeToken), treasury, PROTOCOL_FEE_BPS, owner)
        );
        AxiomPaymentProcessor feeProcessor = AxiomPaymentProcessor(address(feeProxy));

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

    // ─── setRoyaltyBps ───────────────────
    function test_setRoyaltyBps_revertsWhenRoyaltyExceedsCap() public {
        AxiomPaymentProcessor cappedImpl = new AxiomPaymentProcessor();
        ERC1967Proxy capProxy = new ERC1967Proxy(
            address(cappedImpl),
            abi.encodeWithSelector(cappedImpl.initialize.selector, address(nft), address(token), treasury, 100, owner)
        );
        AxiomPaymentProcessor cappedProcessor = AxiomPaymentProcessor(address(capProxy));

        vm.prank(creator);
        vm.expectRevert(AxiomPaymentProcessor.InvalidBps.selector);
        cappedProcessor.setRoyaltyBps(AGENT_TOKEN_ID, 10_000);
    }

    function test_setRoyaltyBps_revertsWhenOwnerNotCreator() public {
        address nftOwner = address(0xFEED);
        nft.setOwner(AGENT_TOKEN_ID, nftOwner);

        vm.prank(nftOwner);
        vm.expectRevert(AxiomPaymentProcessor.NotCreator.selector);
        processor.setRoyaltyBps(AGENT_TOKEN_ID, 5000);
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

    // ─── payForAgentAndCompute ───────────────────────────────────────
    function test_payForAgentAndCompute_creditsCreatorAndPaysProvider() public {
        uint256 agentAmount = 1000e6;
        uint256 computeAmount = 300e6;
        address provider = address(0xD3F);
        uint256 expectedProtocolCut = (agentAmount * PROTOCOL_FEE_BPS) / 10_000;
        uint256 expectedCreatorCut = agentAmount - expectedProtocolCut;

        token.mint(payer, agentAmount + computeAmount);
        vm.prank(payer);
        token.approve(address(processor), agentAmount + computeAmount);

        assertEq(token.balanceOf(payer), agentAmount + computeAmount, "payer pre-balance");
        assertEq(token.balanceOf(provider), 0, "provider pre-balance");
        assertEq(processor.agentEarningsOf(creator), 0, "creator pre-earnings");

        vm.expectEmit(true, true, true, true);
        emit PaymentProcessed(AGENT_TOKEN_ID, payer, creator, agentAmount, expectedCreatorCut, expectedProtocolCut);

        vm.prank(payer);
        processor.payForAgentAndCompute(AGENT_TOKEN_ID, provider, agentAmount, computeAmount);

        assertEq(token.balanceOf(payer), 0, "payer post-balance");
        assertEq(token.balanceOf(provider), computeAmount, "provider post-balance");
        assertEq(processor.agentEarningsOf(creator), expectedCreatorCut, "creator post-earnings");
        assertEq(processor.totalOutstandingEarnings(), expectedCreatorCut, "outstanding earnings tracked");
    }

    function test_payForAgentAndCompute_revertsOnZeroProvider() public {
        uint256 agentAmount = 100e6;
        uint256 computeAmount = 50e6;
        token.mint(payer, agentAmount + computeAmount);
        vm.prank(payer);
        token.approve(address(processor), agentAmount + computeAmount);

        vm.expectRevert(AxiomPaymentProcessor.ZeroAddress.selector);
        vm.prank(payer);
        processor.payForAgentAndCompute(AGENT_TOKEN_ID, address(0), agentAmount, computeAmount);
    }

    function test_payForAgentAndCompute_revertsOnZeroAmount() public {
        address provider = address(0xD3F);
        uint256 agentAmount = 100e6;
        uint256 computeAmount = 50e6;
        token.mint(payer, agentAmount + computeAmount);
        vm.prank(payer);
        token.approve(address(processor), agentAmount + computeAmount);

        vm.expectRevert(AxiomPaymentProcessor.ZeroAmount.selector);
        vm.prank(payer);
        processor.payForAgentAndCompute(AGENT_TOKEN_ID, provider, 0, computeAmount);

        vm.expectRevert(AxiomPaymentProcessor.ZeroAmount.selector);
        vm.prank(payer);
        processor.payForAgentAndCompute(AGENT_TOKEN_ID, provider, agentAmount, 0);
    }

    // ─── V2: _split dedup equivalence ───────────────────────────────
    function test_payForAgentAndCompute_splitMatchesPayForAgent() public {
        uint256 agentAmount = 1000e6;
        uint256 computeAmount = 300e6;
        address provider = address(0xD3F);

        // Reference run: payForAgent alone establishes the per-pay deltas.
        token.mint(payer, 2 * (agentAmount + computeAmount));
        vm.prank(payer);
        token.approve(address(processor), 2 * (agentAmount + computeAmount));

        vm.prank(payer);
        processor.payForAgent(AGENT_TOKEN_ID, agentAmount);
        uint256 refCreatorEarnings = processor.agentEarningsOf(creator);
        uint256 refTreasuryBalance = token.balanceOf(treasury);
        uint256 refOutstanding = processor.totalOutstandingEarnings();
        assertGt(refCreatorEarnings, 0, "reference pay credited creator");

        // Second run: the agent leg of payForAgentAndCompute delegates to the
        // same internal _paySplit — deltas must match the reference exactly.
        uint256 payerBefore = token.balanceOf(payer);
        uint256 providerBefore = token.balanceOf(provider);

        vm.prank(payer);
        processor.payForAgentAndCompute(AGENT_TOKEN_ID, provider, agentAmount, computeAmount);

        assertEq(processor.agentEarningsOf(creator) - refCreatorEarnings, refCreatorEarnings, "same creator cut per pay");
        assertEq(token.balanceOf(treasury) - refTreasuryBalance, refTreasuryBalance, "same protocol cut per pay");
        assertEq(processor.totalOutstandingEarnings() - refOutstanding, refCreatorEarnings, "same outstanding delta");
        assertEq(token.balanceOf(provider), providerBefore + computeAmount, "provider leg paid compute");
        assertEq(token.balanceOf(payer), payerBefore - agentAmount - computeAmount, "payer debited both legs");
    }

    // ─── V2: MAX_PAY cap ─────────────────────────────────────────────
    function test_setMaxPayCap_adminSetsCapAndPayLanesEnforceIt() public {
        uint256 cap = 500e6;
        vm.prank(owner);
        processor.setMaxPayCap(cap);
        assertEq(processor.maxPayCap(), cap, "cap stored");

        token.mint(payer, 1500e6);
        vm.prank(payer);
        token.approve(address(processor), 1500e6);

        vm.expectRevert(abi.encodeWithSelector(AxiomPaymentProcessor.PayAmountExceedsCap.selector, 1000e6, cap));
        vm.prank(payer);
        processor.payForAgent(AGENT_TOKEN_ID, 1000e6);

        vm.expectRevert(abi.encodeWithSelector(AxiomPaymentProcessor.PayAmountExceedsCap.selector, 1000e6, cap));
        vm.prank(payer);
        processor.payForAgentAndCompute(AGENT_TOKEN_ID, address(0xD3F), 1000e6, 100e6);

        // At-cap and below-cap pays succeed on both lanes.
        vm.prank(payer);
        processor.payForAgent(AGENT_TOKEN_ID, cap);
        vm.prank(payer);
        processor.payForAgentAndCompute(AGENT_TOKEN_ID, address(0xD3F), cap, 100e6);
    }

    function test_setMaxPayCap_zeroDisablesCap() public {
        token.mint(payer, 10_000e6);
        vm.prank(payer);
        token.approve(address(processor), 10_000e6);

        vm.prank(owner);
        processor.setMaxPayCap(100e6);
        vm.prank(owner);
        processor.setMaxPayCap(0);

        vm.prank(payer);
        processor.payForAgent(AGENT_TOKEN_ID, 10_000e6);
        assertGt(processor.agentEarningsOf(creator), 0, "uncapped pay succeeded after cap cleared");
    }

    function test_setMaxPayCap_emitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(false, false, false, true);
        emit AxiomPaymentProcessor.MaxPayCapUpdated(0, 1000e6);
        processor.setMaxPayCap(1000e6);
    }

    // ─── V2: role gating (Ownable -> AccessControl) ──────────────────
    function test_nonAdmin_cannotPauseOrUnpause() public {
        bytes32 adminRole = processor.ADMIN_ROLE();

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, payer, adminRole));
        processor.pause();

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, payer, adminRole));
        processor.unpause();
    }

    function test_nonAdmin_cannotSetProtocolFeeBps() public {
        bytes32 adminRole = processor.ADMIN_ROLE();

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, payer, adminRole));
        processor.setProtocolFeeBps(500);
    }

    function test_nonAdmin_cannotSetMaxPayCap() public {
        bytes32 adminRole = processor.ADMIN_ROLE();

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, payer, adminRole));
        processor.setMaxPayCap(1);
    }

    function test_nonAdmin_cannotSetPaymentToken() public {
        bytes32 adminRole = processor.ADMIN_ROLE();
        MockERC20 newToken = new MockERC20("Mock USDG", "mUSDG");

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, payer, adminRole));
        processor.setPaymentToken(address(newToken));
    }

    function test_admin_canPauseAndUnpause_blocksPaysWhilePaused() public {
        token.mint(payer, 1000e6);
        vm.prank(payer);
        token.approve(address(processor), 1000e6);

        vm.prank(owner);
        processor.pause();

        vm.expectRevert(PausableUpgradeable.EnforcedPause.selector);
        vm.prank(payer);
        processor.payForAgent(AGENT_TOKEN_ID, 1000e6);

        vm.prank(owner);
        processor.unpause();

        vm.prank(payer);
        processor.payForAgent(AGENT_TOKEN_ID, 1000e6);
        assertGt(processor.agentEarningsOf(creator), 0, "pay succeeded after unpause");
    }

    function test_nonDefaultAdmin_cannotUpgradeImplementation() public {
        AxiomPaymentProcessor implV2 = new AxiomPaymentProcessor();

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, payer, bytes32(0))
        );
        processor.upgradeToAndCall(address(implV2), "");

        // DEFAULT_ADMIN (the initialize beneficiary) can still upgrade.
        vm.prank(owner);
        processor.upgradeToAndCall(address(implV2), "");
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
        uint256 expectedEffectiveAt = block.timestamp + 1 days;

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
        vm.expectRevert(abi.encodeWithSelector(TimelockManager.DelayNotElapsed.selector, 1 days));
        processor.executeProtocolTreasury();
    }

    function test_executeProtocolTreasury_updatesAfterDelay() public {
        address newTreasury = address(0xBEEF);
        vm.prank(owner);
        processor.proposeProtocolTreasury(newTreasury);

        vm.warp(block.timestamp + 1 days);

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
        vm.warp(block.timestamp + 1 days);

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
        vm.warp(block.timestamp + 1 days);
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
