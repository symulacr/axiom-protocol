// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {IAxiomAgentNFT} from "../src/interfaces/IAxiomAgentNFT.sol";

/// @dev Minimal ERC-20 used in the processor tests. Wraps OZ's ERC20 so we exercise the
///      real OZ code path that the production payment token (USDC.e / USDG) uses.
///      References:
///        - ERC-20 spec: https://eips.ethereum.org/EIPS/eip-20
///        - OpenZeppelin ERC20: https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#ERC20
contract MockERC20 is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Minimal stand-in for AxiomAgentNFT: returns a hardcoded creator for a tokenId so the
///      payment processor can resolve it. Only `creatorOf` is exercised by these tests; the
///      real NFT contract is verified in AxiomAgentNFT.t.sol and is untouched here.
contract MockAxiomAgentNFT is IAxiomAgentNFT {
    mapping(uint256 => address) internal _creators;

    function setCreator(uint256 tokenId, address creator) external {
        _creators[tokenId] = creator;
    }

    function creatorOf(uint256 tokenId) external view override returns (address) {
        return _creators[tokenId];
    }

    function ownerOf(uint256) external pure override returns (address) {
        return address(0);
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

    function setUp() public {
        // Real OZ ERC20 — `MockERC20` wraps it so we mint test funds with `_mint` semantics.
        // OZ ERC20: https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#ERC20
        token = new MockERC20("Mock USDC", "mUSDC");
        nft = new MockAxiomAgentNFT();
        nft.setCreator(AGENT_TOKEN_ID, creator);
        processor = new AxiomPaymentProcessor(
            address(nft),
            address(token),
            treasury,
            PROTOCOL_FEE_BPS,
            owner
        );
    }

    // ─── payForAgent ───────────────────────────────────────────────
    /// @notice payForAgent must pull ERC-20 from the payer, credit the creator's withdrawable
    ///         balance, and forward the protocol's cut to the treasury — in that order.
    function test_payForAgent_creditsCreatorAndTransfersToken() public {
        uint256 amount = 1_000e6;        // 1,000 mUSDC
        uint256 expectedCreatorCut = (amount * PROTOCOL_FEE_BPS) / 10_000;
        uint256 expectedProtocolCut = amount - expectedCreatorCut;

        // Fund payer and approve the processor to pull the full amount.
        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(address(processor), amount);

        // State-of-the-world before the call.
        assertEq(token.balanceOf(payer), amount, "payer pre-balance");
        assertEq(token.balanceOf(address(processor)), 0, "processor pre-balance");
        assertEq(token.balanceOf(treasury), 0, "treasury pre-balance");
        assertEq(processor.agentEarningsOf(creator), 0, "creator pre-earnings");

        vm.expectEmit(true, true, true, true);
        emit PaymentProcessed(AGENT_TOKEN_ID, payer, creator, amount, expectedCreatorCut, expectedProtocolCut);

        vm.prank(payer);
        processor.payForAgent(AGENT_TOKEN_ID, amount);

        // Payer lost the full amount.
        assertEq(token.balanceOf(payer), 0, "payer post-balance");
        // The processor holds the creator's cut; treasury got the protocol cut.
        assertEq(token.balanceOf(address(processor)), expectedCreatorCut, "processor post-balance");
        assertEq(token.balanceOf(treasury), expectedProtocolCut, "treasury post-balance");
        // Creator's withdrawable balance reflects the credit.
        assertEq(processor.agentEarningsOf(creator), expectedCreatorCut, "creator post-earnings");
    }

    /// @notice If the payer never approved, the transferFrom reverts with SafeERC20's
    ///         custom error. The creator's earnings must remain untouched (the whole tx
    ///         reverts atomically, so the state write is rolled back).
    function test_payForAgent_revertsWhenNotApproved() public {
        uint256 amount = 100e6;
        token.mint(payer, amount);

        vm.expectRevert();
        vm.prank(payer);
        processor.payForAgent(AGENT_TOKEN_ID, amount);

        // Atomicity: state writes that happened before the failing external call are rolled
        // back. Creator's earnings stay at zero.
        assertEq(processor.agentEarningsOf(creator), 0, "earnings unchanged on revert");
    }

    /// @notice payForAgent must revert when the NFT returns a zero creator, because an
    ///         unregistered agent cannot receive earnings.
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

    /// @notice An agent creator can explicitly set their royalty to 0 bps, and the protocol
    ///         should receive the full payment (creator earns nothing).
    function test_payForAgent_explicitZeroRoyalty() public {
        uint256 amount = 1_000e6;

        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(address(processor), amount);

        // Creator explicitly opts into 0% royalty.
        vm.prank(creator);
        processor.setRoyaltyBps(AGENT_TOKEN_ID, 0);
        assertTrue(processor.royaltyBpsSet(AGENT_TOKEN_ID), "royalty marked as set");
        assertEq(processor.royaltyBpsOf(AGENT_TOKEN_ID), 0, "stored royalty is 0");

        vm.expectEmit(true, true, true, true);
        emit PaymentProcessed(AGENT_TOKEN_ID, payer, creator, amount, 0, amount);

        vm.prank(payer);
        processor.payForAgent(AGENT_TOKEN_ID, amount);

        // Creator gets nothing; treasury gets everything; processor holds no creator funds.
        assertEq(processor.agentEarningsOf(creator), 0, "creator earnings stay zero");
        assertEq(token.balanceOf(treasury), amount, "treasury receives full amount");
        assertEq(token.balanceOf(address(processor)), 0, "processor holds no funds");
    }

    // ─── withdrawAgentEarnings ──────────────────────────────────────
    /// @notice withdrawAgentEarnings must transfer the payment token to the creator and zero
    ///         out their withdrawable balance. It must NOT use `call{value:}` — no native ETH
    ///         path remains on the contract.
    function test_withdrawAgentEarnings_transfersToken() public {
        uint256 amount = 1_000e6;
        uint256 expectedCreatorCut = (amount * PROTOCOL_FEE_BPS) / 10_000;

        // Drive a real payForAgent so the processor actually holds the tokens.
        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(address(processor), amount);
        vm.prank(payer);
        processor.payForAgent(AGENT_TOKEN_ID, amount);

        assertEq(processor.agentEarningsOf(creator), expectedCreatorCut, "earnings pre-withdraw");
        assertEq(token.balanceOf(creator), 0, "creator pre-token-balance");

        vm.expectEmit(true, false, false, true);
        emit EarningsWithdrawn(creator, expectedCreatorCut);

        vm.prank(creator);
        processor.withdrawAgentEarnings();

        // Creator has the token; processor's earnings slot is zero.
        assertEq(token.balanceOf(creator), expectedCreatorCut, "creator post-token-balance");
        assertEq(processor.agentEarningsOf(creator), 0, "earnings post-withdraw");
        // The processor no longer holds the creator's cut (it forwarded it).
        assertEq(token.balanceOf(address(processor)), 0, "processor post-token-balance");
    }

    function test_withdrawAgentEarnings_revertsOnZero() public {
        vm.expectRevert(AxiomPaymentProcessor.NoEarnings.selector);
        vm.prank(creator);
        processor.withdrawAgentEarnings();
    }

    // ─── setPaymentToken (migration) ────────────────────────────────
    /// @notice Owner can rotate the payment token; the new token becomes the active settlement
    ///         asset for payForAgent and withdrawAgentEarnings.
    function test_setPaymentToken_ownerCanRotate() public {
        MockERC20 newToken = new MockERC20("Mock USDG", "mUSDG");
        address newTokenAddr = address(newToken);
        vm.prank(owner);
        processor.setPaymentToken(newTokenAddr);

        assertEq(processor.paymentToken(), newTokenAddr, "paymentToken updated");
    }

    function test_setPaymentToken_revertsForNonOwner() public {
        MockERC20 newToken = new MockERC20("Mock USDG", "mUSDG");
        vm.prank(payer); // not the owner
        vm.expectRevert();
        processor.setPaymentToken(address(newToken));
    }

    function test_setPaymentToken_revertsForZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(AxiomPaymentProcessor.ZeroAddress.selector);
        processor.setPaymentToken(address(0));
    }
}
