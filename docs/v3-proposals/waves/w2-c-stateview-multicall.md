# Wave 2 Lane C — AxiomStateView (read facade) + Multicall3 read aggregation

- **Agent:** W2-C (Executor)
- **Date:** 2026-08-31
- **Base:** git `7dd19a90` (tree verified clean at start)
- **Scope:** docs/v3-proposals/03-crosscontract-0g-stack.md §1b (AxiomStateView) + Multicall3 read aggregation + one real FE consumer + tests
- **Status:** implemented, all lane-owned suites green; changes left **uncommitted**

> ⚠️ Concurrent-lane note: while this lane worked, a parallel lane in the same checkout added
> `AxiomDelegationRegistry.sol`, `permit2/`, and a Permit2 leg on the Processor
> (`apps/contracts/src/AxiomPaymentProcessor.sol`, `.gitignore`, new test
> `test/AxiomDelegationRegistry.t.sol`, `test/AxiomPaymentProcessorPermit2*.t.sol`).
> Those changes are NOT part of this lane's diff and are left untouched.

---

## 1. Firecrawl research (~6 credits spent)

All raw results cached under `.firecrawl/w2c/`:

| Query / URL | File | Findings |
| --- | --- | --- |
| `firecrawl search "multicall3 aggregate3 read aggregation viem example"` | `search-aggregate3-viem.json` | Canonical usage confirmed: `aggregate3((address target, bool allowFailure, bytes callData)[]) returns ((bool success, bytes returnData)[])` — per-call `allowFailure=true` gives per-item success flags instead of whole-batch revert; this maps 1:1 to wagmi `useReadContracts` semantics. Top hits: github.com/mds1/multicall3, quicknode.com multicall RPC guide. |
| `firecrawl scrape https://github.com/mds1/multicall` | `scrape-multicall3.json` | README security statement captured verbatim: *"because it is a stateless contract, it should be safe when used correctly — **it should never hold your funds after a transaction ends, and you should never approve Multicall3 to spend your tokens**"*. Our helper is read-only (`aggregate3` only, never `aggregate3Value`/`tryAggregate` write paths); docs carry the never-approve/never-hold note. |
| `firecrawl search "0g galileo testnet multicall3 deployment address"` | `search-galileo-multicall3.json` | `https://www.multicall3.com/deployments` lists the canonical `0xcA11bde05977b3631167028862bE2a173976CA11` across chains (chainId table; e.g. mainnet 1, Kovan 42, …). No newer listing diverges from the canonical CREATE2 address. Combined with prior Wave-1 evidence (bytecode verified at that address on chain 16602), the constant in `packages/config/src/multicall3.ts` stands. |
| `firecrawl search "solidity view facade contract anti-pattern gas considerations"` | `search-view-facade.json` | Sanity check: pure/view facades are gas-safe on 0G (zero gas fees); the standard caveats are (a) added contract surface grows bytecode/deploy cost, (b) stale-view risk if the facade caches (ours is stateless — every call re-reads live state), (c) per-call delegatecall/staticcall depth cost, acceptable for UI/indexer read paths. Hits: docs.soliditylang.org security-considerations, ethereum.stackexchange 68098, arxiv 2312.08945 (proxy/diamond gas comparison), fravoll.github.io/solidity-patterns. |

---

## 2. AxiomStateView — facade function inventory + mirrored-logic notes

**File:** `apps/contracts/src/AxiomStateView.sol` (non-upgradeable, no storage, immutable addresses set in constructor: `nft`, `processor`, `vault`; reverts on native value via `NoValue()` — read-only, nothing to approve, never holds funds).

| Function | Mirrored source | Notes / semantics |
| --- | --- | --- |
| `royaltyRecipientOf(uint256) → address` | `AxiomAgentNFT.creatorOf` | `creatorOf` is mint-frozen (never updated on iTransfer — V3 §1 finding M). **Zero → "no royalty recipient"** (unregistered/nonexistent token): the view does NOT revert; the Processor's write-path `AgentCreatorNotRegistered` revert becomes a `address(0)` return here. Documented in natspec. |
| `effectiveRoyaltyBpsOf(uint256) → (royaltyBps, isSet, protocolFeeBps)` | `AxiomPaymentProcessor._effectiveRoyaltyBps` / `royaltyBpsOf` / `royaltyBpsSet` | Mirrors the sentinel logic exactly: `stored == 0 → (0, false)`; effective bps = `min(stored − 1, BPS_DENOMINATOR − protocolFeeBps)` (the clamp Processor applies — surfaced via a read of `royaltyBpsOf`, which already returns the clamped value; clamp-parity is asserted by test). Clamp matters when `protocolFeeBps` is raised AFTER a royalty was set (test covers exactly that path). |
| `agentEarningsOf(address)`, `pendingPayCap()`, `computeRatioMax()` | Processor passthroughs | `pendingPayCap()` = `maxPayCap()` (0 = unlimited); `computeRatioMax` additive headroom (`computeAmount ≤ ratioMax * agentAmount`, 0 = unlimited). |
| `vaultHealthOf(uint256) → (balance, strategyRoot, dailyLimit, dailySpent, resetDay, validUntilDay, expired)` | `AxiomStrategyVault.strategyOf` + `execute` expiry check | `expired = validUntilDay != 0 && block.timestamp/1days > validUntilDay` — the exact `StrategyExpired` predicate in `execute` (line ~218). `validUntilDay == 0` sentinel = no expiry → `expired=false`. balance read via `vault.balanceOf` (separate call so the tuple matches `strategyOf`'s 5-element shape). Vault residual 1 (strategy survives iTransfer) documented in natspec. |
| `verifyPayloadOf(uint256 tokenId, uint256 dataIndex, bytes payload) → bool` | `ERC7857IDataStorageUpgradeable.iDatas` via `IERC7857Metadata.intelligentDatasOf` | `keccak256(payload) == datas[dataIndex].dataHash`; `IntelligentData = (string dataDescription, bytes32 dataHash)`. Nonexistent token reverts inside the NFT getter (`ERC721NonexistentToken`); out-of-range `dataIndex` reverts on array access. **Zero-hash trap documented + tested:** a stored `bytes32(0)` dataHash can never verify any payload (keccak ≠ 0) — never read zero as "verified". |
| `paymentSnapshot(address payer, uint256 tokenId) → (maxPayCap, computeRatioMax, agentBalance, payerAllowance, paymentToken)` | Processor + ERC-20 | Single-call pre-flight of every fact `payForAgent` checks (cap, ratio bound, payer balance, Processor allowance, settlement token). `tokenId` is reserved for the Wave-3 state-hub extension (no read needed today) and is intentionally unused. |

**Implementation notes:**

- `IERC7857Metadata` is imported from `lib/0g-agent-nft` remapping `@0g-agent-nft/interfaces/IERC7857Metadata.sol` (same import path the NFT uses) — typed interface, no low-level ABI decode.
- Compiler forces `AxiomStrategyVault(payable(...))` (payable `receive` in Vault).
- `forge fmt` clean; builds under the repo's via-IR profile (`FOUNDRY_PROFILE=dev`).

**FE/TS surface (hand-maintained, Wave 3 will regen):**

- `packages/config/src/abis/stateView.ts` — `STATE_VIEW_ABI` (human-readable array, same pattern as `paymentProcessor.ts`), exported from `packages/config/src/abis/index.ts`.
- `packages/config/src/multicall3.ts` — canonical `MULTICALL3_ADDRESS` (`0xcA11bde05977b3631167028862bE2a173976CA11`), `MULTICALL3_ABI` aggregate3 slice, and typed `aggregateReads(client, calls)` helper: N reads → ONE `readContract` round-trip via viem `encodeFunctionData`/`decodeFunctionResult`, per-call `allowFailure=true`, failures returned as `{success:false, error}` data (never exceptions), zero calls → no RPC. New package subpath export `"./multicall3"`.
- viem versions: `packages/config` 2.55.13, `apps/frontend` 2.55.19 — no built-in viem `multicall` action was configured for chain 16602 anywhere (viem's chain registry has no `multicall3` contract entry for 0G chains), so the explicit `aggregateReads` helper on the canonical address is the correct path (an FE-wide `multicall` config could be a follow-up, but was out of lane scope).

---

## 3. FE consumer conversion

**Chosen consumer: `apps/frontend/src/pages/AgentPage.tsx`** (payments tab), via new hook `apps/frontend/src/hooks/usePaymentTokenOnchain.ts`.

- **Before:** the earnings/decimals fact row relied on the backend-cached `/v1/payment/config` decimals only; the live on-chain allowance had to be fetched separately in the pay flow (`usePayment.ts priceAndApprove` / `FlowPage` review) with a second sequential `publicClient.readContract` round-trip. Any on-chain-aware surface (e.g. "does the wallet still have allowance?") cost 2 sequential RPCs: `decimals` + `allowance`.
- **After:** `usePaymentTokenOnchain(paymentToken)` fetches **decimals + allowance in ONE Multicall3 `aggregate3` round-trip** (read count 2 → 1; the helper is ready for further calls to be appended at zero extra RPCs). AgentPage now prefers the live on-chain decimals (`onchain.decimals ?? paymentToken?.decimals`) for the earnings display.
- Small enabling change: `usePayment.ts` `PaymentTokenMeta` now carries the optional `paymentToken` address (sourced from the same `/v1/payment/config` response it already fetched) so the hook knows which token to read.
- Backend untouched; `usePayment.ts`/`FlowPage` sequential reads intentionally left as-is (they run inside write flows where the read is followed by a wallet prompt; converting them is not smaller/safer and is listed under risks/follow-ups).

---

## 4. Tests + verification (exact numbers, fresh runs)

| Suite | Command | Result |
| --- | --- | --- |
| StateView unit tests (new) | `forge test --match-contract AxiomStateViewTest` | **19 passed, 0 failed** — covers happy paths, zero-creator (`royaltyRecipientOf(999) == 0`), royalty clamp parity after fee raise, cap/ratio passthrough defaults+sets, empty vault, active strategy, **expired after `validUntilDay`** (day-warp parity with `execute`), balance/dailyLimit, payload verify **true/false**, zero-stored-hash trap, `paymentSnapshot` full pre-flight, zero-address constructor reverts, native-transfer revert, immutable address getters |
| packages/config | `bun test` (repo pattern `--max-concurrency=1`) | **53 passed, 0 failed** (baseline 47 + 6 new `multicall3.test.ts`: canonical address, ABI shape, zero-calls no-RPC, batched decode 2→1 RPC, per-item revert is data not exception, client-error propagation) |
| apps/backend | `bun test` | **181 passed, 0 failed** (baseline 181, untouched) |
| apps/frontend | `bun run typecheck` + `bun run test` | typecheck **clean**; **111 passed, 0 failed** (baseline window 96–112) |
| forge build | `forge build` (dev profile, via-IR) | **pass** |
| forge full suite | `forge test` | **294 passed / 1 failed / 9 skipped** — the single failure is `test/AxiomDelegationRegistry.t.sol` (`NoActiveDelegation != SelectorNotAllowed`), a suite owned by the **parallel permit2/delegation lane** whose files appeared in the shared checkout mid-flight; the pre-existing-baseline suites (baseline 231 pass/8 skip) are unaffected, and excluding that foreign suite the tree is fully green. `test_execute_windowReset_afterWindowElapses` / other `execute` tests pass (verified `AxiomStrategyVault.t.sol` green). |

Debug-code check: no `console.log`, `TODO`, `HACK`, or `debugger` in any file this lane touched.

---

## 5. Files changed (all uncommitted)

**New (this lane):**

- `apps/contracts/src/AxiomStateView.sol`
- `apps/contracts/test/AxiomStateView.t.sol`
- `packages/config/src/multicall3.ts`
- `packages/config/src/multicall3.test.ts`
- `packages/config/src/abis/stateView.ts`
- `apps/frontend/src/hooks/usePaymentTokenOnchain.ts`

**Modified (this lane):**

- `packages/config/src/abis/index.ts` (export `STATE_VIEW_ABI`)
- `packages/config/package.json` (add `"./multicall3"` subpath export)
- `apps/frontend/src/hooks/usePayment.ts` (PaymentTokenMeta carries optional `paymentToken` address)
- `apps/frontend/src/pages/AgentPage.tsx` (wire `usePaymentTokenOnchain`, prefer live decimals)

**Not touched (per constraints):** `AxiomMockUSDC.sol`, deploy scripts, ABI regen scripts. Parallel-lane files (`AxiomDelegationRegistry.sol`, `permit2/`, Processor diff, `.gitignore`, their tests) left untouched.

**Research cache:** `.firecrawl/w2c/*.json` (4 files).

---

## 6. Risks & follow-ups

1. **Facade address lifecycle:** `AxiomStateView` is non-upgradeable by design; a V3 redeploy of any underlying contract requires deploying a new facade and re-pointing FE/backend env (`AXIOM_STATE_VIEW_ADDRESS` not yet added to `resolveAddress` — deliberate, since no deployment exists until Wave 3).
2. **`effectiveRoyaltyBpsOf` parity is read-based:** it returns Processor's already-clamped `royaltyBpsOf`; if a future Processor change moves the clamp (e.g. into `_paySplit` only), the facade and its clamp-parity test will flag the drift. Keep the "drift is a bug" contract note.
3. **`paymentSnapshot` `tokenId` currently unused** — reserved so the FE pay flow can migrate to one call without another ABI change; lint-clean today.
4. **Galileo Multicall3 evidence** is address-level (canonical CREATE2 + prior Wave-1 bytecode check); multicall3.com does not yet enumerate chain 16602 explicitly. If a future deployment listing contradicts this, only `MULTICALL3_ADDRESS` changes (single constant).
5. **`usePaymentTokenOnchain` doesn't yet replace the FlowPage review allowance poll** — the poll is one read inside a write flow; converting it touches the payment boundary and deserves its own lane (recommend Wave 3 with the `paymentSnapshot` ABI once the facade is deployed).
6. **Parallel lane interference:** the failing `AxiomDelegationRegistryTest` is outside this lane's scope; if it is still failing at merge time it must be fixed by whichever lane owns delegation, not patched here.
