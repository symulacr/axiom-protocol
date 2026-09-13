# Wave 1 — Lane A: Payment Security Fixes (MAX_PAY Cap Bypass + Compute-Leg Ratio Bound + maxPayCap NatSpec)

**Lane:** W1-A (payment security)
**Date:** 2026-08-30
**Base commit:** `51c36395d` (verified clean before start)
**Status:** implemented, tested, **uncommitted** in working tree (parent handles commits)
**Files touched (this lane):** `apps/contracts/src/AxiomPaymentProcessor.sol`, `apps/contracts/test/AxiomPaymentProcessor.t.sol`, `apps/contracts/test/FuzzAxiomPaymentProcessor.t.sol`

---

## 1. Findings fixed

### F-1 (CRITICAL) — MAX_PAY cap bypass on compute lanes

**Before** (`AxiomPaymentProcessor.sol` @ base commit):

- `payComputeProvider` (~L322-328) did a raw `safeTransferFrom(msg.sender, provider, amount)` with zero cap check.
- The compute leg of `payForAgentAndCompute` (~L340-345) did the same for `computeAmount`.
- `maxPayCap` was only enforced inside `_paySplit` (~L270-272), so two of the three pay lanes bypassed the M8 on-chain cap. The doc comment at the cap setter even advertised "enforced on both pay lanes" — false for the compute lane until now.

**After:**

- New single capped pull primitive `_payTransferFrom(payer, to, amount)` (`AxiomPaymentProcessor.sol:290-297`) enforces, on every call:
  - the MAX_PAY cap: `if ($.maxPayCap != 0 && amount > $.maxPayCap) revert PayAmountExceedsCap(amount, $.maxPayCap)` (0 = disabled, unchanged semantics — see §3.3),
  - the zero-amount guard (`ZeroAmount`).
- All three lanes route through it:
  1. `payForAgent` → `_paySplit` → `_payTransferFrom(payer, address(this), amount)` (`:319`).
  2. `payComputeProvider` → `_payTransferFrom(msg.sender, provider, amount)` (`:365`).
  3. `payForAgentAndCompute` compute leg → `_payTransferFrom(msg.sender, provider, computeAmount)` (`:387`).
- `_paySplit` keeps its own non-transfer logic (creator resolution, split math, earnings credit, treasury forward, events) byte-for-byte identical; only the pull leg was swapped for the shared primitive. The old inline cap check in `_paySplit` was removed because `_payTransferFrom` is now the single enforcement point — no duplicated cap logic to drift.
- Zero-address checks stayed at the external entry points (`revert` context differs per lane; not a cap concern).

### F-2 (HIGH) — royalty evasion via compute leg (agentAmount=1 wei starves the creator split)

**Before:** `payForAgentAndCompute` accepted an arbitrary `provider` and arbitrary `agentAmount`/`computeAmount` ratio; `agentAmount=1` credited the creator ~nothing while ~the whole invoice went to the provider as "compute", bypassing the royalty mechanism.

**After (fix option (a), as recommended by the brief):** new admin-settable ratio bound (`AxiomPaymentProcessor.sol:380-384`):

```solidity
uint256 ratioMax = _getStorage().computeRatioMax;
if (ratioMax != 0 && computeAmount > ratioMax * agentAmount) {
    revert ComputeRatioExceeded(computeAmount, ratioMax * agentAmount);
}
```

- New error `ComputeRatioExceeded(uint256 computeAmount, uint256 maxCompute)` (`:29`), new event `ComputeRatioMaxUpdated` (`:48`), new view `computeRatioMax()` (`:185-190`), new `ADMIN_ROLE`-gated setter `setComputeRatioMax(uint256)` (`:192-203`).
- The bound is **additive headroom**: `computeAmount ≤ computeRatioMax × agentAmount`. It only limits how heavy the compute leg may be *relative to* the agent leg; it never restricts a legitimate agent payment by itself.
- **Justification for (a) over (b):** a plain uncapped compute lane (option b) would leave the H1 attack fully intact — the entire point of the merged consensus is that an arbitrary provider + arbitrary ratio = royalty bypass, made worse once Permit2/delegation (proposal 02) authorizes spend by signature. (a) is 4 lines + 1 storage slot, uses the proven `0-disables` cap idiom already established by `maxPayCap` on this contract, and requires no provider registry (which would add a whole admin surface for no benefit at this stage).

### F-3 (LOW) — `maxPayCap = 0` footgun documentation

`setMaxPayCap` (`:167-181`) now carries a NatSpec `@dev` note: 0 disables the cap entirely; V3 policy treats it as an **admin-only emergency setting, not an operating mode**, to be used only transiently (e.g. during an incident), with an off-chain monitoring expectation to alert on `MaxPayCapUpdated(_, 0)`.

**Choice on 0-semantics kept:** `0 disables the cap` was retained (the brief explicitly left this to lane B). Consistency note: `computeRatioMax` uses the identical `0 = unlimited` sentinel so operators only have one idiom to reason about on this contract. If lane B switches the sentinel for `maxPayCap` (e.g. 0 ⇒ revert), it should switch both or document the asymmetry.

---

## 2. Design choices

- **Single primitive, no split-math change.** `_payTransferFrom` is the only token-pull path in the contract now; split arithmetic, `TransferAmountMismatch` balance-diff guard, earnings credit ordering and events are untouched.
- **Revert ordering is intentionally preserved where observable:** in `payForAgentAndCompute` the ratio check runs *before* `_paySplit`, so a ratio-violating call reverts atomically with zero state change (creator earnings untouched — covered by tests).
- **Overflow:** `ratioMax * agentAmount` can theoretically overflow uint256 for extreme admin values; both are admin-set, and Solidity 0.8 checked arithmetic reverts safely on overflow — a revert (not a bypass) is the acceptable failure mode, so no extra bounding was added (no over-engineering).
- **Zero-amount check moved into `_payTransferFrom`:** previously duplicated at 3 call sites; the semantics are identical (`ZeroAmount`), and `payForAgent`'s explicit pre-check was kept for its slightly earlier revert point (before creator lookup). Net behavior change for the compute lanes: `payComputeProvider(x, 0)` / `payForAgentAndCompute(x, y, 0, z)` now revert `ZeroAmount` exactly as before.
- **No ABI regeneration, no deploys, no mock changes** (AxiomMockUSDC untouched) — per lane constraints. Wave 3 owns ABI regen; the new external surface (`computeRatioMax()`, `setComputeRatioMax()`, `ComputeRatioExceeded`, `ComputeRatioMaxUpdated`) is additive, so the ABI drift gate at Wave 3 will pick it up in one pass.

## 3. Storage layout diff

Per the V2 discipline (append at gap tail, shrink gap by exactly 1 per var; see `AxiomAgentNFT.sol:59-62` comments and `docs/adr/004-contract-rewrite-plan.md` §4):

| Item | Before | After |
| --- | --- | --- |
| `PaymentProcessorStorage.__gap` | `uint256[48]` | `uint256[47]` (shrunk by exactly 1) |
| New var | — | `uint256 computeRatioMax` appended after `maxPayCap`, at the gap tail |
| Struct total footprint | unchanged | unchanged (1 var + 1 gap slot = net zero) |
| Pre-existing fields moved | — | **none** |

Verification: `forge inspect AxiomPaymentProcessor storageLayout --json` before vs after → **byte-identical output** (`diff` = empty). Note: all Axiom state sits in the ERC-7201 namespace (`agent.storage.AxiomPaymentProcessor`), so `forge inspect` reports only the non-namespaced `ReentrancyGuard._status` slot (slot 0) — the authoritative check is (i) the before/after JSON identity, which confirms nothing outside the namespace moved, plus (ii) the struct-side diff above, where the namespace-internal layout is guaranteed by the append-at-tail rule itself (fields are never reordered; the gap absorbs the delta). This mirrors how the V2 `maxPayCap` append was validated. A throwaway compile-time probe also confirmed the gap array type is `uint256[47]` (test compiled against the real struct, then removed to keep the tree clean).

## 4. Tests added

### `test/AxiomPaymentProcessor.t.sol` (+10)

| # | Test | Covers |
| --- | --- | --- |
| 1 | `test_payComputeProvider_revertsWhenOverCap` | (i) compute lane over-cap reverts `PayAmountExceedsCap` |
| 2 | `test_payComputeProvider_atCapBoundary` | (iii) compute lane at-cap boundary succeeds + event |
| 3 | `test_payForAgentAndCompute_computeLegRevertsWhenOverCap` | (i) merged-lane compute leg over-cap reverts; zero state delta on revert |
| 4 | `test_payForAgentAndCompute_bothLegsAtCapBoundary` | (iii) both legs exactly at cap succeed, full split verified |
| 5 | `test_defaultComputeRatioMaxIsZero_unlimited` | default 0 = unlimited (inert upgrade) |
| 6 | `test_setComputeRatioMax_adminSetsAndEmits` | (ii) admin-settable + event |
| 7 | `test_setComputeRatioMax_revertsForNonAdmin` | (ii) role gating |
| 8 | `test_payForAgentAndCompute_revertsWhenRatioExceeded` | (ii) ratio bound reverts `ComputeRatioExceeded`, earnings untouched |
| 9 | `test_payForAgentAndCompute_ratioBoundaryAllowed` | (ii) exact boundary `computeAmount == k * agentAmount` allowed |
| 10 | `test_setComputeRatioMax_zeroDisablesRatioBound` | (ii) 0 = unlimited semantics |

### `test/FuzzAxiomPaymentProcessor.t.sol` (+3)

| # | Test | Covers |
| --- | --- | --- |
| 11 | `testFuzz_payComputeProvider_capEnforced` | (i) fuzz: compute lane enforces cap for arbitrary (cap, amount); at/below-cap forwards in full |
| 12 | `testFuzz_payForAgentAndCompute_ratioBoundEnforced` | (ii) fuzz: ratio bound enforced/boundary-allowed across arbitrary (ratioMax, agentAmount, computeAmount); 256 runs/seed |
| 13 | `testFuzz_setComputeRatioMax_revertsForNonAdmin` | (ii) fuzz: non-admin cannot set the bound; storage unchanged |

## 5. Build & test output

- `forge build` (profile: `via_ir = true`, solc 0.8.36): **"Compiler run successful with warnings"** — only pre-existing OZ `Warning (6335)` / `Warning (2424)` library warnings; zero errors.
- `forge test` (full suite, `apps/contracts`): **231 passed, 0 failed, 8 skipped (239 total, 16 suites)**, exit code 0.
  - The 8 skips are pre-existing fork/probe tests (env-gated `vm.skip` in FuzzAxiom* sanity + live-address probes) — unrelated to this lane.
  - Baseline at lane start was 218 passed (the campaign brief's 201 predates another lane's committed-wave verifier additions) → this lane adds **+13** (10 unit + 3 fuzz), all listed in §4 and all `[PASS]` in the run output.
  - One transient observation during development: running `AxiomTeeVerifier.t.sol` **in isolation** (`--match-contract`) showed 3 spurious failures (a `DelayNotElapsed` time-skew artifact and an address-mismatch in another lane's new test) that never reproduce in a full `forge test` run — 5 consecutive isolated runs plus every full run are green. Not caused by, and not fixable within, this lane's scope; flagged for the parent orchestrator since that test file belongs to another lane.
- Environment note: `forge` on PATH is aliased to a tmux session in this workspace; all commands used `~/.foundry/bin/forge` (foundry 1.5.1-stable) directly.

## 6. Risks / notes for parent

1. **Frontend/backend must not assume the compute lane is uncapped.** After this change, over-cap `payComputeProvider` and over-cap compute legs revert `PayAmountExceedsCap`, and ratio-violating merged pays revert `ComputeRatioExceeded`. Any FE quote path or backend relay that composes these calls should read `maxPayCap()` / `computeRatioMax()` and pre-validate (mirrors the strategyGuard pattern).
2. **`computeRatioMax` defaults to 0 = unlimited**, so upgrading the proxy in place does not change behavior until an admin sets a bound. Same posture as `maxPayCap`; V3 policy should set both at deploy/upgrade time (deployment checklist item, not this lane).
3. **ABI surface grew** (2 functions, 1 view, 1 error, 1 event). ABI regeneration is Wave 3; until then, packages that hard-import current ABIs won't know the new selectors (they don't need them to keep working — all changes are additive and existing call shapes behave identically below the cap/bound).
4. **Isolated-run flake** in `AxiomTeeVerifier.t.sol` (3 tests, other lane's file) — details in §5; full-suite runs are consistently green.
5. Working tree also contains other lanes' in-flight changes (`AxiomAgentNFT.sol`, `AxiomStrategyVault.sol`, verifiers, backend indexer, `packages/config/src/abis/agentNft.ts`). This lane's changes are exactly: the three files listed at the top. **Nothing committed** by this lane.
