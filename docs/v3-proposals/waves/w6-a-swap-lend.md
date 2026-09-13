# Wave 6 Lane A — Processor swap pool (constant-product), LP shares, and lending: implementation report

- **Lane:** W6-A (contract lane)
- **Date:** 2026-08-31
- **Base HEAD:** `676c4bdb52c33058ceb2e242ef59fdf0d4127d7f` (verified clean before work)
- **Result:** `forge build` clean (solc 0.8.36, via_ir ON, Cancun; 0 errors, warnings all pre-existing from vendored OZ); full `forge test` **342 passed / 0 failed / 9 skipped** (baseline 316/0/9 → **+26 new tests**). All changes left **uncommitted**. On-chain upgrade deliberately NOT performed (parent orchestrates deploys).

---

## 1. Files changed

| File | Change |
| --- | --- |
| `apps/contracts/src/AxiomPaymentProcessor.sol` | Swap pool + lending added in-place (no new contract). Storage gap `45 → 37` (8 new vars, `:154-162`), 11 new errors (`:41-50`), 9 new events (`:77-86`), admin setters + views + swap/lend functions (`:758-1105`). Existing pay/permit/2771/statefold code untouched. |
| `apps/contracts/src/permit2/ISignatureTransfer.sol` | Vendored interface extended with upstream batch types: `PermitBatchTransferFrom`, `permitBatchTransferFrom`, `permitTransferFrom` (copied 1:1 from Uniswap permit2 `src/interfaces/ISignatureTransfer.sol @ main`, MIT). See §5. |
| `apps/contracts/test/AxiomPaymentProcessorPermit2.t.sol` | `MockPermit2` stub extended with `permitTransferFrom` + `permitBatchTransferFrom` lanes (exact upstream EIP-712 hashing: witnessless `PermitTransferFrom` typehash, `PermitBatchTransferFrom` typehash with `keccak256(abi.encodePacked(permittedHashes))`; same unordered-nonce bitmap; same domain). Existing witness-lane tests untouched and still green. |
| `apps/contracts/test/AxiomPaymentProcessorSwap.t.sol` | NEW — 26-test suite (§6). Imports the shared `MockPermit2` stub from the Permit2 suite. |
| `packages/config/src/abis/paymentProcessor.ts` + `packages/config/abi/AxiomPaymentProcessor.json` | Regenerated via `scripts/generate-abis.sh` (7 ABIs). Dist rebuilt (`bun run --cwd packages/config build`, tsc exit 0; `addLiquidity`/`swapExactIn`/`quoteSwap`/`borrowFactorBps`/`repay` confirmed present in `dist/abis/paymentProcessor.js`). |

Untouched: `AxiomMockUSDC.sol` (permissionless mint unchanged), `AxiomGasTank.sol`, `AxiomStrategyVault.sol`, all deploy scripts.

---

## 2. Design notes

**Pool lives in the Processor, token A = paymentToken, token B = admin-set** (`setSwapPairToken`, zero-check + must-differ-from-token-A + re-point blocked while `swapReserveA/B` or `totalLpShares` > 0 → `MigrationBlocked`). All swap lane functions validate `tokenIn ∈ {paymentToken, swapPairToken}` via `_swapTokens` → else `InvalidSwapToken(tokenIn)`.

**Tracked reserves, not raw balances.** Reserves are explicit `swapReserveA`/`swapReserveB`, updated ONLY by add/remove/swap/borrow/repay. This is what keeps creator earnings (held in the same contract, same USDC token) out of the pool's k. Solvency = tracked reserve ≤ raw ERC-20 balance for both tokens, exposed as the `swapSolvency()` view and asserted internally after every state-changing pool op (`_assertSwapSolvent`, reverts `SwapInsolvent(token, tracked, balance)`).

**CEI ordering per op:** validate → Permit2-pull / quote → update tracked state → external token send → solvency assert → event. The received-diff guard (`received != requested → TransferAmountMismatch`) wraps every pull, mirroring `_paySplit`.

**Constant-product math** (fee on input, mirror of Uniswap V2 `getAmountOut`): `amountInWithFee = amountIn * (10000 − swapFeeBps); out = reserveOut * amountInWithFee / (reserveIn * 10000 + amountInWithFee)`. `swapFeeBps` default 30, max 1000. Hand-computed assertions in T6 (e.g. 1000 USDC into 1M/500 pool → `498_003_490_519_951_608` wei WETH).

**LP shares:** first depositor `sqrt(usdc * weth)` (OpenZeppelin `Math.sqrt`); later `min(usdc*total/reserveA, weth*total/reserveB)`; zero-share guard `InsufficientLiquidity` prevents dust-POOL grief on the first-side-min path. `removeLiquidity` pays pro-rata of tracked reserves and burns; integer-floor remainders stay in the pool (tested).

**Lending v1 (testnet rails):** collateral = `agentEarnings + lpValueInUsdc` where `lpValueInUsdc = aShare + bShare * reserveA / reserveB` (B side priced at the pool's own ratio; a balanced 100% LP values at exactly 2× its A-share — asserted in T9). Debt is USDC-denominated, no interest accrual, no liquidation — both documented in NatSpec. `borrow` enforces `_enforcePayCap` (the position-size cap: a user can never borrow more than the cap even with huge collateral), LTV check (`InsufficientBorrowCollateral(required, max)`), and a pool-reserve check (`InsufficientPoolReserve`) — the LTV check fires first when factor ≤ 50% because `factor × 2 × reserveA ≤ reserveA` iff `factor ≤ 50%`; the reserve-guard test therefore raises the factor to 80% to make the guard reachable. `repay` Permit2-pulls USDC, floors debt at zero (excess stays in the reserve, documented; no refund leg).

**Caps policy:** `swapExactIn.amountIn` and `borrow.amount` enforce `maxPayCap` via `_enforcePayCap`. `addLiquidity` is exempt — an LP deposit is a withdrawable position, not a payment; documented in NatSpec.

**ERC-2771:** Permit2 binds `spender = raw msg.sender` inside its hash, so `swapExactIn`/`repay`/`addLiquidity` are NOT relayable — same contract as `payForAgentWithPermit2`. T25 pins it: calling `swapExactIn` from the trusted forwarder with a signed user's signature reverts at the permit leg (`InvalidSigner`), no tokens move.

## 3. Storage diff (gap 45 → 37)

`forge inspect AxiomPaymentProcessor storageLayout` before (HEAD 676c4bd) vs after — **top-level layout byte-identical** (`_status`, ReentrancyGuard, slot 0, both before and after; diff of the two JSON dumps is empty). All 8 new vars append at the ERC-7201 namespace gap tail (`0xb6e9ac…ebc00`), `:154-162`:

| # | Var | Type |
| --- | --- | --- |
| 1 | `swapPairToken` | address |
| 2 | `swapReserveA` | uint256 |
| 3 | `swapReserveB` | uint256 |
| 4 | `swapFeeBps` | uint256 |
| 5 | `totalLpShares` | uint256 |
| 6 | `lpShares` | mapping(address => uint256) |
| 7 | `borrowFactorBps` | uint256 |
| 8 | `borrowDebt` | mapping(address => uint256) |

Namespace footprint: 58 slots pre-W6 + 8 = 66 → gap 45 → 37. Upgrade-in-place safe: pre-W6 impls never read the 8 new tail slots; zero defaults are inert (`swapFeeBps`/`borrowFactorBps` are written by the admin setters before any pool op in the wiring flow, matching the W5 forwarder pattern).

## 4. Function inventory (all new)

| Function | Line | Notes |
| --- | --- | --- |
| `setSwapPairToken(address)` admin | 758 | zero + ≠tokenA + no-liquidity re-point guard; `SwapPairTokenUpdated` |
| `setSwapFeeBps(uint256)` admin | 775 | max 1000; `SwapFeeBpsUpdated` |
| `setBorrowFactorBps(uint256)` admin | 790 | max 8000; `BorrowFactorBpsUpdated` |
| `swapPairToken()` / `swapFeeBps()` / `borrowFactorBps()` / `swapReserveA()` / `swapReserveB()` / `lpSharesOf` / `totalLpShares` / `borrowDebtOf` | views | |
| `swapSolvency()` view | 840 | tracked ≤ balance both tokens; reverts `SwapInsolvent` |
| `addLiquidity(usdc, weth, PermitBatchTransferFrom, sig)` | 873 | one Permit2 batch sig; exempt from maxPayCap; `LiquidityAdded` |
| `removeLiquidity(shares)` | 941 | pro-rata payout; `LiquidityRemoved` |
| `quoteSwap(tokenIn, amountIn)` view | 967 | x*y=k, fee on input |
| `swapExactIn(tokenIn, amountIn, minOut, PermitTransferFrom, sig)` | 985 | cap + slippage (`SwapSlippage`) + `Swapped` event |
| `lpValueInUsdc(lp)` view | 1041 | A-share + B-share at pool ratio |
| `borrow(amount)` | 1057 | LTV + pool-reserve + cap; USDC out of reserve A; `Borrowed` |
| `repay(amount, PermitTransferFrom, sig)` | 1080 | Permit2 pull; debt floors at 0; `Repaid` |

## 5. Permit2 interface delta (vendored `src/permit2/ISignatureTransfer.sol`)

Added from upstream (byte-compatible, MIT), in addition to the existing `PermitTransferFrom` + `permitWitnessTransferFrom`:

- `struct PermitBatchTransferFrom { TokenPermissions[] permitted; uint256 nonce; uint256 deadline; }`
- `function permitTransferFrom(PermitTransferFrom memory, SignatureTransferDetails calldata, address owner, bytes calldata signature) external;` — needed by `swapExactIn`/`repay` (the trimmed interface previously only carried the witness variant)
- `function permitBatchTransferFrom(PermitBatchTransferFrom memory, SignatureTransferDetails[] calldata, address owner, bytes calldata signature) external;` — needed by `addLiquidity` (one signature over both pool tokens; `permit.permitted` must contain exactly the two pool tokens with amounts ≥ requested, validated in-contract via the `matched[2]` pattern + `PermitBatchTokenMissing`)

No other interface changes; the W2-A witness pay lane compiles unchanged against the extended interface.

## 6. Test inventory (26 new, `test/AxiomPaymentProcessorSwap.t.sol`)

| # | Test | Covers |
| --- | --- | --- |
| T1 | `test_addLiquidity_firstLP_sqrtShares` | first LP = `sqrt(x*y)` = 22_360_679_774_997_896; reserves tracked; event exact |
| T2 | `test_addLiquidity_singleSignature_pullsBothTokens` | one batch permit pulls USDC + WETH |
| T3 | `test_addLiquidity_secondLP_proportionalShares` | balanced deposit → `min` formula both sides equal |
| T4 | `test_addLiquidity_secondLP_unbalancedGetsMinSide` | unbalanced → A-side min governs |
| T5 | `test_quoteSwap_zeroReserves_returnsZero` | empty-pool quote (placeholder guard, see also T12's slippage path) |
| T6 | `test_quoteSwap_exactMath_handComputed` | A→B = 498_003_490_519_951_608; B→A = 1_990_031_876 (hand-computed) |
| T7 | `test_swapExactIn_happyPath_usdcForWeth` | quote == payout, reserves updated, event |
| T8 | `test_swapExactIn_happyPath_wethForUsdc` | reverse direction |
| T9 | `test_swapExactIn_slippageRevert` | `SwapSlippage(amountOut, minOut)` |
| T10 | `test_swapExactIn_enforcesMaxPayCap` | cap fires before the permit leg |
| T11 | `test_swapExactIn_foreignToken_revertsInvalidSwapToken` | `InvalidSwapToken(rogue)` |
| T12 | `test_quoteSwap_foreignToken_revertsInvalidSwapToken` | quote lane validates token sides too |
| T13 | `test_removeLiquidity_proportionalPayout` | pro-rata after a reserve-shifting swap; floor remainder |
| T14 | `test_solvency_invariant_heldAcrossOps` | `swapSolvency()` after add/swap/remove/swap |
| T15 | `test_swapSolvency_detectsUnderfundedReserve` | drained balance → `SwapInsolvent` |
| T16 | `test_borrow_happyPath` | 100% LP, LTV 50% → maxDebt = reserveA; reserve debited |
| T17 | `test_borrow_ltvExceeded_reverts` | `InsufficientBorrowCollateral` after headroom drain |
| T18 | `test_borrow_noCollateral_reverts` | zero earnings + zero LP → LTV revert |
| T19 | `test_borrow_exceedsPoolReserve_reverts` | factor 80% → pool-reserve guard reachable |
| T20 | `test_borrow_enforcesMaxPayCap` | cap on borrow amount |
| T21 | `test_repay_happyPath` | debt cleared, reserve restored, `Repaid` |
| T22 | `test_repay_overpayment_floorsDebtAtZero` | excess stays in the reserve |
| T23 | `test_repay_zeroAmount_reverts` | `ZeroAmount` before the permit leg |
| T24 | `test_setSwapPairToken_adminAndGuards` | zero/≠A/non-admin/MigrationBlocked/re-point-after-drain |
| T25 | `test_swapExactIn_notRelayable_throughTrustedForwarder` | relayed swap fails at the permit leg, no tokens move |
| T26 | `test_setSwapFeeBps_andBorrowFactor_boundsAndEvents` | max bounds (1000 / 8000) + 1 reverts |

### Forge output (full suite)

```text
Ran 23 test suites in 36.62s (44.39s CPU time):
  342 tests passed, 0 failed, 9 skipped (351 total tests)
```

Baseline at HEAD 676c4bd: 316 passed / 0 failed / 9 skipped → **26 added, 0 regressions**. (9 skips are the fork-gated `LiveForkTest` tests, pre-existing.)

## 7. Verification evidence

- `forge build --force`: exit 0, **0 errors** (`grep -c "Error ("` = 0), 63 warnings all from vendored OZ libs (pre-existing).
- `bash scripts/generate-abis.sh`: 7 ABIs regenerated; `paymentProcessor.ts` gained 20 new ABI entries.
- `bun run --cwd packages/config build` + `typecheck`: exit 0; new selectors confirmed in `packages/config/dist/abis/paymentProcessor.js`.
- `forge inspect AxiomPaymentProcessor storageLayout` before/after diff: empty (top-level); gap 45 → 37 in the namespace (§3).
- Storage-layout note: the W5 lane discovered `forge` fails under this environment's tmux hook unless `TMUX` is unset — invoke forge as `env -u TMUX forge …`.
- No TODOs, no debug code (a temporary `DbgValuation.t.sol` used during test debugging was deleted), no key material touched.

## 8. Risks / open items

1. **LP-value feedback loop.** `lpValueInUsdc` prices the B share at the pool ratio, and `borrow` drains reserve A — so borrowing reduces every LP's collateral value while their A-share sits in the reserve. Deliberate for testnet (conservative: collateral falls as the pool is drawn down); a production lane should use an external oracle for the B price.
2. **No interest, no liquidation** (task-scoped, NatSpec-documented). Debt can go stale on testnet; the exposure is bounded by the LTV factor and the per-op cap.
3. **`swapSolvency` is asserted, not enforced structurally.** A future bug that moves tracked tokens without updating reserves will hit the revert at op-end, but the admin should also monitor the `swapSolvency()` view off-chain (it reverts → alarm).
4. **Single-token B.** One pool per Processor instance; re-pointing is blocked while liquidity exists (T24), so a token migration requires full LP drain first.
5. **Frontend/backend integration (cross-lane):** consume the regenerated `PAYMENT_PROCESSOR_ABI`; the batch-permit signing payload (`PermitBatchTransferFrom`, spender = processor) needs a FE helper mirroring `apps/frontend/src/lib/permit2.ts`.
6. **On-chain wiring (parent orchestrates):** upgrade → `setSwapPairToken(<weth-like>)` → `setSwapFeeBps(30)` → `setBorrowFactorBps(5000)` before opening pool ops.
