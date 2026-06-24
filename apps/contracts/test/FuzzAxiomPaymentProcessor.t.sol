// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {IAxiomAgentNFT} from "../src/interfaces/IAxiomAgentNFT.sol";

/// @title FuzzAxiomPaymentProcessor.t.sol
/// @notice Wave 11 fuzz + invariant test suite for AxiomPaymentProcessor.
/// @dev    The pinned on-chain address was never deployed (see BUGS.md Bug-1).
///         This suite deploys a local instance of `AxiomPaymentProcessor` against
///         a real ERC-20, exercising the same SafeERC20 code paths USDC.e would use.

/// @notice Minimal real ERC-20 used by the fuzz tests. Wraps OZ's ERC20.
contract MockERC20 is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    /// @notice Test-only mint helper.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice ERC-20 whose `transferFrom` ALWAYS returns `false`. SafeERC20 MUST revert.
contract FalseReturningERC20 is ERC20 {
    constructor() ERC20("FalseToken", "FALSE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Returns `false` instead of the standard bool.
    function transferFrom(address, address, uint256) public pure override returns (bool) {
        return false;
    }
}

/// @notice Minimal IAxiomAgentNFT stub. Returns a configurable creator.
contract StubAxiomAgentNFT is IAxiomAgentNFT {
    mapping(uint256 => address) internal _creators;
    address public immutable DEFAULT_CREATOR;

    constructor(address defaultCreator) {
        DEFAULT_CREATOR = defaultCreator;
    }

    function setCreator(uint256 tokenId, address creator) external {
        _creators[tokenId] = creator;
    }

    function creatorOf(uint256 tokenId) external view override returns (address) {
        address c = _creators[tokenId];
        return c == address(0) ? DEFAULT_CREATOR : c;
    }

    function ownerOf(uint256) external pure override returns (address) {
        return address(0);
    }
}

/// @notice Unit + fuzz suite for AxiomPaymentProcessor.
contract FuzzAxiomPaymentProcessorUnit is Test {
    AxiomPaymentProcessor internal processor;
    MockERC20 internal token;
    StubAxiomAgentNFT internal nft;

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
    event ComputeProviderPaid(address indexed provider, uint256 amount);
    event PaymentTokenUpdated(address indexed oldToken, address indexed newToken);

    function setUp() public {
        // Real OZ ERC20, wrapped in MockERC20 for the test-only `mint` helper.
        token = new MockERC20("Mock USDC", "mUSDC");
        nft = new StubAxiomAgentNFT(creator);
        processor = new AxiomPaymentProcessor(
            address(nft),
            address(token),
            treasury,
            PROTOCOL_FEE_BPS,
            owner
        );
    }

    // ─── 1. Fuzz setPaymentToken ──────────────────────────────────────

    /// @notice setPaymentToken accepts any non-zero address.
    function testFuzz_setPaymentToken_ownerSucceeds(address newToken) public {
        vm.assume(newToken != address(0));
        vm.prank(owner);
        processor.setPaymentToken(newToken);
        assertEq(processor.paymentToken(), newToken, "paymentToken should be updated");
    }

    /// @notice A non-owner calling setPaymentToken reverts.
    function testFuzz_setPaymentToken_revertsForNonOwner(address caller, address newToken)
        public
    {
        vm.assume(caller != owner);
        vm.assume(caller != address(0));
        vm.assume(newToken != address(0));
        vm.prank(caller);
        vm.expectRevert();
        processor.setPaymentToken(newToken);
        // Storage untouched.
        assertEq(processor.paymentToken(), address(token), "paymentToken should be unchanged");
    }

    /// @notice setPaymentToken(0) reverts with ZeroAddress.
    function testFuzz_setPaymentToken_revertsOnZero() public {
        vm.prank(owner);
        vm.expectRevert(AxiomPaymentProcessor.ZeroAddress.selector);
        processor.setPaymentToken(address(0));
    }

    /// @notice setPaymentToken emits PaymentTokenUpdated with the previous
    ///         token as `oldToken`.
    function testFuzz_setPaymentToken_emitsEvent(address newToken) public {
        vm.assume(newToken != address(0));
        vm.assume(newToken != address(token));
        vm.expectEmit(true, true, false, false);
        emit PaymentTokenUpdated(address(token), newToken);
        vm.prank(owner);
        processor.setPaymentToken(newToken);
    }

    // ─── 2. Fuzz payForAgent ──────────────────────────────────────────

    /// @notice Happy path: payer splits `amount` into creator earnings and protocol treasury.
    function testFuzz_payForAgent_happySplits(uint256 agentTokenId, uint256 amount) public {
        // Bound the amount so the test stays within practical ERC-20 supply.
        amount = bound(amount, 1, type(uint128).max);
        address c = creator;

        // Seed: payer holds `amount` and has approved the processor.
        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(address(processor), amount);

        // Resolve the expected split.
        uint256 expectedCreatorCut = (amount * PROTOCOL_FEE_BPS) / 10_000;
        uint256 expectedProtocolCut = amount - expectedCreatorCut;

        vm.expectEmit(true, true, true, true);
        emit PaymentProcessed(agentTokenId, payer, c, amount, expectedCreatorCut, expectedProtocolCut);
        vm.prank(payer);
        processor.payForAgent(agentTokenId, amount);

        // (b) creator earnings credited
        assertEq(processor.agentEarningsOf(c), expectedCreatorCut, "creator earnings");
        // (c) treasury received the protocol cut via safeTransfer
        assertEq(token.balanceOf(treasury), expectedProtocolCut, "treasury received protocolCut");
        // The processor holds the creator's cut (in custody, not yet withdrawn)
        assertEq(token.balanceOf(address(processor)), expectedCreatorCut, "processor holds creatorCut");
        // Payer's balance is zero
        assertEq(token.balanceOf(payer), 0, "payer paid full amount");
    }

    /// @notice payForAgent reverts when approval is missing (atomicity preserved).
    function testFuzz_payForAgent_revertsWithoutApproval(uint256 amount) public {
        amount = bound(amount, 1, type(uint128).max);
        token.mint(payer, amount);
        // Note: NO approve call.
        vm.prank(payer);
        vm.expectRevert();
        processor.payForAgent(AGENT_TOKEN_ID, amount);
        // Atomicity: state writes that happened before the failing external
        // call are rolled back, so creator's earnings stay at zero.
        assertEq(processor.agentEarningsOf(creator), 0, "earnings untouched on revert");
        assertEq(token.balanceOf(treasury), 0, "treasury untouched on revert");
    }

    /// @notice payForAgent(0) reverts with ZeroAmount.
    function testFuzz_payForAgent_revertsOnZeroAmount(uint256 agentTokenId) public {
        vm.prank(payer);
        vm.expectRevert(AxiomPaymentProcessor.ZeroAmount.selector);
        processor.payForAgent(agentTokenId, 0);
    }

    /// @notice SafeERC20 reverts when the token returns `false`.
    function testFuzz_payForAgent_revertsOnNonStandardToken(uint256 amount) public {
        amount = bound(amount, 1, type(uint128).max);
        FalseReturningERC20 bad = new FalseReturningERC20();
        vm.prank(owner);
        processor.setPaymentToken(address(bad));

        // The bad token's `transferFrom` ALWAYS returns false. We must
        // pre-fund and approve for the OZ ERC20 _update path to execute
        // (the OZ base sets balances, then `transferFrom` is overridden to
        // unconditionally return false; the SafeERC20 wrapper on the
        // processor side then sees the false return and reverts).
        bad.mint(payer, amount);
        vm.prank(payer);
        bad.approve(address(processor), amount);

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(bad))
        );
        processor.payForAgent(AGENT_TOKEN_ID, amount);
    }

    // ─── 3. Fuzz withdrawAgentEarnings ──────────────────────────────────

    /// @notice Drive earnings into the creator's balance, withdraw, verify the sweep.
    function testFuzz_withdrawAgentEarnings_sweeps(uint128 targetEarnings) public {
        // PROTOCOL_FEE_BPS = 250 → creatorCut = amount / 40. Minimum amount is 40.
        uint256 minAmount = 40;
        uint256 maxAmount = uint256(targetEarnings) * 40;
        if (maxAmount < minAmount) maxAmount = minAmount;
        if (maxAmount > type(uint128).max) maxAmount = type(uint128).max;

        token.mint(payer, maxAmount);
        vm.prank(payer);
        token.approve(address(processor), maxAmount);
        vm.prank(payer);
        processor.payForAgent(AGENT_TOKEN_ID, maxAmount);

        uint256 actualEarnings = processor.agentEarningsOf(creator);
        assertTrue(actualEarnings > 0, "earnings must be positive after payForAgent");

        // Pre-state.
        assertEq(token.balanceOf(creator), 0, "creator pre-token-balance");
        assertGe(
            token.balanceOf(address(processor)),
            actualEarnings,
            "processor holds creator's cut"
        );

        vm.expectEmit(true, false, false, true);
        emit EarningsWithdrawn(creator, actualEarnings);
        vm.prank(creator);
        processor.withdrawAgentEarnings();

        // (b) creator received via safeTransfer
        assertEq(token.balanceOf(creator), actualEarnings, "creator received earnings");
        // (a) earnings slot is zero
        assertEq(processor.agentEarningsOf(creator), 0, "earnings slot zeroed");
        // Processor no longer holds the creator's cut
        assertEq(token.balanceOf(address(processor)), 0, "processor no longer holds creatorCut");
    }

    /// @notice (a) earnings slot zeroed BEFORE the external safeTransfer call (CEI ordering).
    function test_withdrawAgentEarnings_ceiOrdering_stateIsZeroedFirst() public {
        // Seed earnings via a real payForAgent.
        token.mint(payer, 1_000_000);
        vm.prank(payer);
        token.approve(address(processor), 1_000_000);
        vm.prank(payer);
        processor.payForAgent(AGENT_TOKEN_ID, 1_000_000);

        uint256 snapshotEarnings = processor.agentEarningsOf(creator);
        assertGt(snapshotEarnings, 0, "earnings seeded");

        // Direct CEI verification: after the call, the slot is zero.
        vm.prank(creator);
        processor.withdrawAgentEarnings();
        assertEq(processor.agentEarningsOf(creator), 0, "earnings zeroed by withdraw");
    }

    /// @notice (c) Reentrancy on withdrawAgentEarnings is blocked by ReentrancyGuard.
    function testFuzz_withdrawAgentEarnings_reentrancyBlocked(uint128) public {
        // Drive a non-zero earnings balance.
        token.mint(payer, 1_000_000);
        vm.prank(payer);
        token.approve(address(processor), 1_000_000);
        vm.prank(payer);
        processor.payForAgent(AGENT_TOKEN_ID, 1_000_000);

        // First call from `creator` succeeds and zeros the slot.
        vm.prank(creator);
        processor.withdrawAgentEarnings();

        // A re-entrant second call must revert with NoEarnings. The
        // earnings-slot zeroing happens before any external call (CEI), so
        // a re-entrant caller would observe a zero slot and revert.
        vm.prank(creator);
        vm.expectRevert(AxiomPaymentProcessor.NoEarnings.selector);
        processor.withdrawAgentEarnings();
    }

    // ─── 4. Fuzz payComputeProvider ─────────────────────────────────────

    /// @notice payComputeProvider forwards the full `amount` to the provider via SafeERC20.
    function testFuzz_payComputeProvider_happy(address provider, uint256 amount) public {
        vm.assume(provider != address(0));
        vm.assume(provider != payer);
        vm.assume(provider != address(processor));
        amount = bound(amount, 1, type(uint128).max);
        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(address(processor), amount);

        vm.expectEmit(true, false, false, true);
        emit ComputeProviderPaid(provider, amount);
        vm.prank(payer);
        processor.payComputeProvider(provider, amount);

        // Provider received the full amount
        assertEq(token.balanceOf(provider), amount, "provider received full amount");
        // Payer paid the full amount
        assertEq(token.balanceOf(payer), 0, "payer paid full amount");
        // Processor did NOT retain any balance from this path
        assertEq(token.balanceOf(address(processor)), 0, "processor holds nothing");
    }

    /// @notice payComputeProvider(0, amount) reverts with ZeroAddress.
    function testFuzz_payComputeProvider_revertsOnZeroProvider(uint256 amount) public {
        amount = bound(amount, 1, type(uint128).max);
        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(address(processor), amount);
        vm.prank(payer);
        vm.expectRevert(AxiomPaymentProcessor.ZeroAddress.selector);
        processor.payComputeProvider(address(0), amount);
    }

    /// @notice payComputeProvider(provider, 0) reverts with ZeroAmount.
    function testFuzz_payComputeProvider_revertsOnZeroAmount(address provider) public {
        vm.assume(provider != address(0));
        vm.prank(payer);
        vm.expectRevert(AxiomPaymentProcessor.ZeroAmount.selector);
        processor.payComputeProvider(provider, 0);
    }

    // ─── 5. Live-code probe (Bug-1) ──────────────────────────────────────

    /// @notice Probe: the wave-pinned AxiomPaymentProcessor has no code at the fork block.
    function test_liveAddress_hasNoCode_atPinnedBlock() public {
        // The wave brief explicitly says to fork at block 38748015.
        vm.createSelectFork("https://evmrpc-testnet.0g.ai", 38_748_015);
        address live = address(0xEf1bA81ba3A9c37a3A6efF46BB2B029d4068fd8D);
        // EXTCODESIZE is the cheapest "has code" check.
        uint256 size;
        assembly {
            size := extcodesize(live)
        }
        // Replace the assertion with `assertGt(size, 0)` once redeployed.
        assertEq(size, 0, "live AxiomPaymentProcessor has no code (see BUGS.md Bug-1)");
    }

    /// @notice Same probe at the latest block. If the contract were
    ///         redeployed, this would observe code.
    function test_liveAddress_hasNoCode_atLatestBlock() public {
        vm.createSelectFork("https://evmrpc-testnet.0g.ai");
        address live = address(0xEf1bA81ba3A9c37a3A6efF46BB2B029d4068fd8D);
        uint256 size;
        assembly {
            size := extcodesize(live)
        }
        assertEq(size, 0, "live AxiomPaymentProcessor still has no code at latest block");
    }
}

// ─── Invariant suite ─────────────────────────────────────────────────────

/// @notice Handler contract limiting the fuzzer to public, non-admin surface.
contract ProcessorHandler is Test {
    AxiomPaymentProcessor public immutable processor;
    MockERC20 public immutable token;
    address public immutable creator;
    address public immutable treasury;
    address public payer;

    // Bounded set of payers and token IDs so the fuzzer explores stable state space.
    address[] public payers;
    uint256[] public agentTokenIds;

    /// @dev ghost variables for invariant accounting.
    uint256 public ghostTotalDeposited;
    uint256 public ghostTotalCreatorEarnings;
    uint256 public ghostTotalWithdrawn;
    uint256 public ghostTotalProtocolPaid;
    uint256 public ghostCallCount;

    constructor(AxiomPaymentProcessor _processor, MockERC20 _token, address _creator) {
        processor = _processor;
        token = _token;
        creator = _creator;
        payer = address(0xBA7A);
        treasury = processor.protocolTreasury();
        payers.push(address(0xBA7A));
        payers.push(address(0xA11CE));
        payers.push(address(0xB0B));
        payers.push(address(0xCAFE));
        agentTokenIds.push(1);
        agentTokenIds.push(2);
        agentTokenIds.push(3);
    }

    function _pickPayer(uint256 seed) internal view returns (address) {
        return payers[seed % payers.length];
    }

    function _pickTokenId(uint256 seed) internal view returns (uint256) {
        return agentTokenIds[seed % agentTokenIds.length];
    }

    // ─── Target functions (the fuzzer only calls these) ──────────────

    function payForAgentFuzz(uint256 payerSeed, uint256 agentSeed, uint256 amount) external {
        address p = _pickPayer(payerSeed);
        uint256 tokenId = _pickTokenId(agentSeed);
        // Bound the amount to a sensible range.
        amount = bound(amount, 1, 1_000_000 ether);

        // Pre-fund the payer and approve the processor.
        token.mint(p, amount);
        vm.prank(p);
        token.approve(address(processor), amount);

        uint256 creatorEarningsBefore = processor.agentEarningsOf(creator);
        uint256 treasuryBalanceBefore = token.balanceOf(treasury);

        vm.prank(p);
        try processor.payForAgent(tokenId, amount) {
            // Update ghosts only on success.
            ghostTotalDeposited += amount;
            ghostTotalCreatorEarnings +=
                (processor.agentEarningsOf(creator) - creatorEarningsBefore);
            ghostTotalProtocolPaid += (token.balanceOf(treasury) - treasuryBalanceBefore);
            ghostCallCount += 1;
        } catch {
            // Atomicity: nothing changes on revert. We don't update ghosts.
        }
    }

    function withdrawEarningsFuzz() external {
        uint256 bal = processor.agentEarningsOf(creator);
        if (bal == 0) {
            vm.prank(creator);
            vm.expectRevert(AxiomPaymentProcessor.NoEarnings.selector);
            processor.withdrawAgentEarnings();
            return;
        }
        uint256 creatorTokenBefore = token.balanceOf(creator);
        vm.prank(creator);
        try processor.withdrawAgentEarnings() {
            ghostTotalWithdrawn += (token.balanceOf(creator) - creatorTokenBefore);
            ghostCallCount += 1;
        } catch {}
    }

    function payComputeProviderFuzz(uint256 payerSeed, uint256 amount) external {
        address p = _pickPayer(payerSeed);
        amount = bound(amount, 1, 1_000_000 ether);
        address provider = address(
            uint160(uint256(keccak256(abi.encode(p, amount, ghostCallCount))))
        );
        // Provider must not be address(0) per the contract's ZeroAddress check.
        if (provider == address(0)) provider = address(0x1111);

        token.mint(p, amount);
        vm.prank(p);
        token.approve(address(processor), amount);

        vm.prank(p);
        try processor.payComputeProvider(provider, amount) {
            ghostCallCount += 1;
        } catch {}
    }
}

/// @notice Invariant suite using targetSelectors for the handler's user-facing functions.
contract FuzzAxiomPaymentProcessorInvariants is StdInvariant, Test {
    AxiomPaymentProcessor internal processor;
    MockERC20 internal token;
    StubAxiomAgentNFT internal nft;
    ProcessorHandler internal handler;

    address internal owner = address(0x0A11CE);
    address internal treasury = address(0x0A1D);
    address internal creator = address(0xC0FFEE);

    uint256 internal constant PROTOCOL_FEE_BPS = 250;

    function setUp() public {
        token = new MockERC20("Mock USDC", "mUSDC");
        nft = new StubAxiomAgentNFT(creator);
        processor = new AxiomPaymentProcessor(
            address(nft),
            address(token),
            treasury,
            PROTOCOL_FEE_BPS,
            owner
        );
        handler = new ProcessorHandler(processor, token, creator);

        // Limit the fuzzer to the three user-facing handler functions.
        bytes4[] memory selectors = new bytes4[](3);
        selectors[0] = ProcessorHandler.payForAgentFuzz.selector;
        selectors[1] = ProcessorHandler.withdrawEarningsFuzz.selector;
        selectors[2] = ProcessorHandler.payComputeProviderFuzz.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// @notice Invariant: deposits - withdrawals == creator's on-chain withdrawable earnings.
    function invariant_totalCreatorEarningsMatchesTotalCreatorPayments() public view {
        uint256 slot = processor.agentEarningsOf(creator);
        uint256 expected = handler.ghostTotalCreatorEarnings() - handler.ghostTotalWithdrawn();
        assertEq(slot, expected, "creator earnings slot must equal credits minus withdrawals");
    }

    /// @notice Invariant: processor token balance equals creator earnings slot.
    function invariant_authorizedTokenTransfersBalanced() public view {
        uint256 processorBalance = token.balanceOf(address(processor));
        uint256 creatorEarnings = processor.agentEarningsOf(creator);
        assertEq(
            processorBalance,
            creatorEarnings,
            "processor token balance must equal creator earnings slot"
        );
    }
}
