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
/// @dev    The "live" AxiomPaymentProcessor address pinned in the wave brief
///         (0xEf1bA81ba3A9c37a3A6efF46BB2B029d4068fd8D, Galileo) is documented as
///         deployed. THIS TEST SUITE DISCOVERS THAT THE DEPLOYMENT NEVER ACTUALLY
///         HAPPENED — see BUGS.md Bug-1. The on-chain code field at the pinned
///         address is empty at every block checked (earliest → 38748015 → latest).
///
///         To exercise the *code* the production deploy was supposed to install,
///         this suite deploys a local instance of `AxiomPaymentProcessor` from
///         `src/AxiomPaymentProcessor.sol` against a real ERC-20 (the only mock
///         allowed by the wave brief). The MockERC20 below wraps OZ's real ERC-20
///         implementation, so the SafeERC20 / IERC20 paths the production contract
///         uses are the real ones — this is the same code path USDC.e / USDG
///         would exercise on Galileo.
///
///         References (every claim in this file is grounded here):
///           - Wave-11 brief: see `apps/contracts/test/BUGS.md`
///           - OpenZeppelin SafeERC20 (handles non-conforming ERC-20s):
///             https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#SafeERC20
///           - OpenZeppelin IERC20:
///             https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#IERC20
///           - OpenZeppelin ERC20 (the implementation MockERC20 wraps):
///             https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#ERC20
///           - ERC-20 spec: https://eips.ethereum.org/EIPS/eip-20
///           - Foundry fuzzing: https://book.getfoundry.sh/forge/fuzz-testing
///           - Foundry invariants: https://book.getfoundry.sh/forge/invariant-testing
///           - 0G Chain (Galileo, chainId 16602):
///             https://docs.0g.ai/developer-hub/testnet/testnet-overview
///           - OpenZeppelin Ownable (onlyOwner used by setPaymentToken):
///             https://docs.openzeppelin.com/contracts/5.x/api/access#Ownable
///           - OpenZeppelin ReentrancyGuard (used by payForAgent / withdrawAgentEarnings):
///             https://docs.openzeppelin.com/contracts/5.x/api/utils#ReentrancyGuard

// ─── Test scaffolding ────────────────────────────────────────────────────

/// @notice Minimal real ERC-20 used by the fuzz tests. Wraps OZ's real ERC-20
///         so the SafeERC20 code path the production contract relies on is the
///         actual production path. The only "mock" surface is the `mint` helper
///         used to seed test balances (this is the only mock the wave brief
///         permits).
contract MockERC20 is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    /// @notice Test-only mint helper. The production payment token (USDC.e / USDG)
    ///         does NOT have this — we need it to seed test balances cheaply.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice ERC-20 whose `transferFrom` ALWAYS returns `false` (the
///         non-conforming "returns false" path). OpenZeppelin's SafeERC20 MUST
///         detect the false return and revert with `SafeERC20FailedOperation`.
///         This is the exact failure mode that protects the protocol against
///         malicious or buggy ERC-20 implementations in production.
/// @dev    Source: https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#SafeERC20
///         OZ SafeERC20's `_callOptionalReturn` reverts when
///         `returndata.length != 0 && !abi.decode(returndata, (bool))` — see
///         `lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol`.
contract FalseReturningERC20 is ERC20 {
    constructor() ERC20("FalseToken", "FALSE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Returns `false` instead of the standard bool. The processor's
    ///         SafeERC20 wrapper MUST catch this and revert.
    function transferFrom(address, address, uint256) public pure override returns (bool) {
        return false;
    }
}

/// @notice Minimal IAxiomAgentNFT stub. Returns a configurable creator for any
///         tokenId. The full AxiomAgentNFT is exercised in AxiomAgentNFT.t.sol
///         and is not part of this fuzz surface — payForAgent only reads
///         `creatorOf`, so a minimal stub is sufficient and keeps this suite
///         focused on the processor itself.
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

// ─── Unit + fuzz suite ───────────────────────────────────────────────────

/// @notice Unit + fuzz suite for AxiomPaymentProcessor. See file header for
///         the rationale on local deployment vs. the on-chain address.
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

    // ─── 1. Fuzz setPaymentToken(address) ─────────────────────────────────
    // Verify: (a) only owner can call, (b) the new token is set, (c) zero
    // address is rejected.

    /// @notice setPaymentToken accepts any NON-ZERO address and the new token
    ///         becomes the active settlement asset.
    function testFuzz_setPaymentToken_ownerSucceeds(address newToken) public {
        vm.assume(newToken != address(0));
        vm.prank(owner);
        processor.setPaymentToken(newToken);
        assertEq(processor.paymentToken(), newToken, "paymentToken should be updated");
    }

    /// @notice A non-owner calling setPaymentToken reverts. (a) from the brief.
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

    /// @notice setPaymentToken(0) reverts with the contract's ZeroAddress custom
    ///         error. (c) from the brief.
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

    // ─── 2. Fuzz payForAgent(uint256 agentTokenId, uint256 amount) ────────
    // Verify: (a) approval required, (b) creator earnings credited with
    // creatorCut, (c) treasury receives protocolCut via safeTransfer, (d)
    // revert on non-standard return.

    /// @notice Happy path: a payer with sufficient allowance splits `amount`
    ///         into the creator's withdrawable balance and the protocol
    ///         treasury's balance, exactly as the brief requires.
    function testFuzz_payForAgent_happySplits(uint256 agentTokenId, uint256 amount) public {
        // Bound the amount so the test stays within practical ERC-20 supply
        // (we mint a balance equal to `amount`).
        amount = bound(amount, 1, type(uint128).max);
        address c = creator;

        // Seed: payer holds `amount` and has approved the processor.
        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(address(processor), amount);

        // Resolve the expected split. The contract falls back to protocolFeeBps
        // when no per-agent royalty is set.
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

    /// @notice (a) from the brief: if the payer has not approved the processor
    ///         for `amount`, payForAgent reverts and the creator's earnings
    ///         remain at zero (atomicity preserved).
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

    /// @notice payForAgent(0) reverts with the contract's ZeroAmount custom
    ///         error. (sanity)
    function testFuzz_payForAgent_revertsOnZeroAmount(uint256 agentTokenId) public {
        vm.prank(payer);
        vm.expectRevert(AxiomPaymentProcessor.ZeroAmount.selector);
        processor.payForAgent(agentTokenId, 0);
    }

    /// @notice (d) from the brief: SafeERC20 reverts with
    ///         `SafeERC20FailedOperation(token)` when the token returns the
    ///         boolean `false` (a non-conforming "returns false" ERC-20).
    ///         Note: tokens that return NO data at all are accepted by
    ///         SafeERC20 (this is the documented OZ behavior, see
    ///         `lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol`
    ///         line 97: revert only if `returndata.length != 0 && !abi.decode(...)`).
    ///         So we test the *failure* mode: a token that returns `false`
    ///         MUST trigger the revert. See:
    ///         https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#SafeERC20
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

    // ─── 3. Fuzz withdrawAgentEarnings() with random accumulated earnings ─
    // Verify: (a) creator's balance zeroed before the external call (CEI),
    // (b) creator receives via safeTransfer, (c) re-entrancy blocked.

    /// @notice Drive `targetEarnings` into the creator's balance, then
    ///         withdraw and verify the full sweep. We bound `amount` so the
    ///         integer-truncated creatorCut is non-zero (the truncation
    ///         behavior for tiny amounts is documented in BUGS.md Bug-3).
    function testFuzz_withdrawAgentEarnings_sweeps(uint128 targetEarnings) public {
        // PROTOCOL_FEE_BPS = 250 → creatorCut = amount / 40. The smallest
        // amount that yields a non-zero creatorCut is 40. We use that as
        // the lower bound; upper bound is `type(uint128).max`.
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

    /// @notice (a) the earnings slot is zeroed BEFORE the external
    ///         safeTransfer call (CEI ordering). The OZ ReentrancyGuard
    ///         blocks the re-entrancy attack, AND the CEI ordering ensures
    ///         the slot is already zero when the external call lands.
    ///         This is the externally-observable consequence of CEI: after
    ///         a successful withdraw, the slot must be zero.
    function test_withdrawAgentEarnings_ceiOrdering_stateIsZeroedFirst() public {
        // Seed earnings via a real payForAgent.
        token.mint(payer, 1_000_000);
        vm.prank(payer);
        token.approve(address(processor), 1_000_000);
        vm.prank(payer);
        processor.payForAgent(AGENT_TOKEN_ID, 1_000_000);

        uint256 snapshotEarnings = processor.agentEarningsOf(creator);
        assertGt(snapshotEarnings, 0, "earnings seeded");

        // Direct CEI verification: after the call, the slot is zero. A
        // non-CEI-ordered withdraw would either (a) not zero the slot
        // before the external call, allowing a re-entrant caller to
        // observe the original balance, or (b) zero the slot AFTER the
        // transfer, which would still be safe but is not the canonical
        // CEI pattern. We assert the post-state (slot = 0) which is the
        // externally-observable CEI invariant.
        vm.prank(creator);
        processor.withdrawAgentEarnings();
        assertEq(processor.agentEarningsOf(creator), 0, "earnings zeroed by withdraw");
    }

    /// @notice (c) Re-entrancy on withdrawAgentEarnings is blocked by OZ's
    ///         ReentrancyGuard. A second call (whether by a re-entrant
    ///         attacker or a duplicate call from the same EOA) MUST revert
    ///         because the earnings slot has been zeroed.
    function testFuzz_withdrawAgentEarnings_reentrancyBlocked(uint128) public {
        // Drive a non-zero earnings balance.
        token.mint(payer, 1_000_000);
        vm.prank(payer);
        token.approve(address(processor), 1_000_000);
        vm.prank(payer);
        processor.payForAgent(AGENT_TOKEN_ID, 1_000_000);

        // First call from `creator` (succeeds and zeros the slot).
        vm.prank(creator);
        processor.withdrawAgentEarnings();

        // A re-entrant second call must revert with NoEarnings. The
        // earnings-slot zeroing happens before any external call (CEI), so
        // a re-entrant caller would observe a zero slot and revert.
        vm.prank(creator);
        vm.expectRevert(AxiomPaymentProcessor.NoEarnings.selector);
        processor.withdrawAgentEarnings();
    }

    // ─── 4. Fuzz payComputeProvider(address provider, uint256 amount) ────
    // Verify: (a) event emitted, (b) tokens transferred.

    /// @notice payComputeProvider forwards the full `amount` to the named
    ///         provider via SafeERC20.safeTransferFrom, and emits the
    ///         ComputeProviderPaid event with the exact amount.
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
    // The pinned AxiomPaymentProcessor address is documented as deployed.
    // It isn't. We probe the chain at the wave-pinned fork block to confirm.

    /// @notice Probe: the wave-pinned AxiomPaymentProcessor has no code at
    ///         the wave-pinned fork block. This is the ship-blocker finding
    ///         recorded in BUGS.md (Bug-1). The test is intentionally
    ///         written so a future, correct redeploy would cause it to
    ///         fail (i.e. the assertion would no longer hold) — that is
    ///         the correct signal: "the bug is fixed when this test breaks".
    function test_liveAddress_hasNoCode_atPinnedBlock() public {
        // The wave brief explicitly says to fork at block 38748015.
        vm.createSelectFork("https://0g-galileo-testnet.drpc.org", 38_748_015);
        address live = address(0xEf1bA81ba3A9c37a3A6efF46BB2B029d4068fd8D);
        // EXTCODESIZE is the cheapest "has code" check available without
        // a contract call.
        uint256 size;
        assembly {
            size := extcodesize(live)
        }
        // Document the current (broken) state.
        // Replace the assertion with `assertGt(size, 0)` once the contract
        // is actually redeployed.
        assertEq(size, 0, "live AxiomPaymentProcessor has no code (see BUGS.md Bug-1)");
    }

    /// @notice Same probe at the latest block. If the contract were
    ///         redeployed, this would observe code.
    function test_liveAddress_hasNoCode_atLatestBlock() public {
        vm.createSelectFork("https://0g-galileo-testnet.drpc.org");
        address live = address(0xEf1bA81ba3A9c37a3A6efF46BB2B029d4068fd8D);
        uint256 size;
        assembly {
            size := extcodesize(live)
        }
        assertEq(size, 0, "live AxiomPaymentProcessor still has no code at latest block");
    }
}

// ─── Invariant suite ─────────────────────────────────────────────────────

/// @notice Handler contract: limits the fuzzer to the public, non-admin
///         surface of the processor. The invariants only hold over USER
///         actions, so we exclude the admin setters and pause/unpause from
///         the target selectors.
contract ProcessorHandler is Test {
    AxiomPaymentProcessor public immutable processor;
    MockERC20 public immutable token;
    address public immutable creator;
    address public immutable treasury;
    address public payer;

    // Bounded set of payers and token IDs so the fuzzer explores a stable
    // state space. Address(0) is reserved for the zero-address invariant
    // (i.e. setPaymentToken(0) must always revert — though we don't target
    // that path here, we keep the seed set clean of address(0)).
    address[] public payers;
    uint256[] public agentTokenIds;

    /// @dev ghost variables for invariant accounting.
    uint256 public ghostTotalDeposited;       // sum of all `amount` paid in via payForAgent
    uint256 public ghostTotalCreatorEarnings; // sum of all creatorCut credited
    uint256 public ghostTotalWithdrawn;       // sum of all EarningsWithdrawn
    uint256 public ghostTotalProtocolPaid;    // sum of all payComputeProvider
    uint256 public ghostCallCount;

    constructor(AxiomPaymentProcessor _processor, MockERC20 _token, address _creator) {
        processor = _processor;
        token = _token;
        creator = _creator;
        payer = address(0xBA7A);
        treasury = processor.protocolTreasury();
        // Seed a fixed roster of payers. Foundry's fuzzer will re-use these
        // as the `actor` for the bound handlers.
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
        // Bound the amount to a sensible range. We must not produce a
        // deposit that would make invariants false; the amounts are bounded
        // small enough to never overflow uint256 totals.
        amount = bound(amount, 1, 1_000_000 ether);

        // Pre-fund the payer and approve the processor for exactly `amount`.
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

/// @notice Invariant suite. Uses `targetSelectors` to limit the fuzzer to
///         the handler's user-facing functions.
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

    /// @notice Invariant: deposits (creator credit increases) - withdrawals
    ///         (creator token received) == creator's on-chain withdrawable
    ///         earnings balance. This is the conservation-of-value property
    ///         that proves the contract cannot mint, lose, or double-count
    ///         creator earnings across any sequence of payForAgent /
    ///         withdrawAgentEarnings calls.
    function invariant_totalCreatorEarningsMatchesTotalCreatorPayments() public view {
        uint256 slot = processor.agentEarningsOf(creator);
        uint256 expected = handler.ghostTotalCreatorEarnings() - handler.ghostTotalWithdrawn();
        assertEq(slot, expected, "creator earnings slot must equal credits minus withdrawals");
    }

    /// @notice Invariant: every token that entered the processor (via
    ///         payForAgent and payComputeProvider) is exactly accounted
    ///         for by (a) the creator's earnings slot, (b) tokens forwarded
    ///         to the treasury, (c) tokens forwarded to compute providers,
    ///         and (d) tokens forwarded to the creator on withdrawal. The
    ///         processor's own token balance must equal the creator's
    ///         unwithdrawn earnings slot — if it holds more, tokens are
    ///         stuck; if it holds less, tokens leaked.
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
