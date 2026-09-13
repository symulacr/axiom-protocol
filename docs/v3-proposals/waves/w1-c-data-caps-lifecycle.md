# Wave 1 — Lane C: Data Caps & Lifecycle Fixes

- **Date:** 2026-08-30
- **Scope:** Findings 1–6 from `docs/v3-proposals/03-crosscontract-0g-stack.md` (capacity + lifecycle) and `docs/v3-proposals/01-multicall3-batching.md` (MEDIUM findings): iData byte cap, `Updated` event de-bloat, zero-creator dead tokens, Vault residuals, `withdrawMintFees` stub.
- **Status:** Implemented, uncommitted. `forge build` green, lane-scope `forge test` green, backend `bun test` 175/175 (baseline), backend `tsc --noEmit` clean.

---

## Finding 1 — HIGH: Unbounded `IntelligentData[]` size

**Before:** `mint`, `mintWithRole` (both overloads) and `update` on `AxiomAgentNFT` accepted any-length arrays with arbitrarily large `dataDescription` strings. Per-mint/update gas and the `Updated` event payload were fully caller-controlled (proposal 03, §2 table row `iDatas[tokenId]`).

**After:**

- New constant `MAX_I_DATA_BYTES = 4096` (public, compile-time — zero storage slots; the `uint256[44]` gap is untouched, `forge inspect` layout unchanged for pre-existing fields).
- New internal `_checkDataSize(IntelligentData[] calldata)` sums `abi.encode(entry).length` across all entries (the only unbounded field is the string; `dataHash` is bytes32 and folds into the fixed per-entry overhead), reverting `DataSizeExceeded(uint256 provided, uint256 max)`.
- Wired into every ingress path: `AxiomAgentNFT.mint` (~L334), `_mintWithRole` (~L386, covers both `mintWithRole` overloads and therefore iClone-adjacent role mints), and `update` (~L325).
- Zero new state; the check is `pure`.

**Files:** `apps/contracts/src/AxiomAgentNFT.sol`

---

## Finding 2 — HIGH: `Updated` event bloat (old+new full arrays)

**Before:**

```solidity
event Updated(uint256 indexed tokenId, IntelligentData[] oldDatas, IntelligentData[] newDatas);
```

`_updateData` copied the full old storage array into memory on every mint/update and emitted both arrays. Event decode cost (and backend payload size) scaled with total data size.

**After:**

```solidity
event Updated(uint256 indexed tokenId, bytes32 oldRoot, IntelligentData[] newDatas);
```

- `oldRoot = keccak256(abi.encode(oldDatas))` — recomputable by any consumer from the 0G-stored payload; `bytes32(0)` when the token had no prior data (fresh mint).
- The old-array memory copy still exists transiently (needed for the root) but is no longer serialized into the log.

### Migration note (old vs new signature) — coordinate at V3 ABI regen

| | Old (deployed V2) | New (source, ships at V3 deploy) |
| --- | --- | --- |
| Signature | `Updated(uint256 indexed tokenId,(string,string[]...)` in human terms: `Updated(uint256 indexed, (string dataDescription, bytes32 dataHash)[], (string dataDescription, bytes32 dataHash)[])` | `Updated(uint256 indexed, bytes32, (string dataDescription, bytes32 dataHash)[])` |
| topic0 | differs | differs (topics now `tokenId, oldRoot` — two indexed args before the tuple) |

**Consumers updated in this wave (do NOT redeploy; ABIs regen in Wave 3):**

1. `packages/config/src/abis/agentNft.ts` — human-readable ABI string updated (single source of truth for the backend watcher).
2. `apps/backend/src/indexer/events/parser.ts` — `Updated` decoder now emits `{ tokenId, oldRoot, newDatasCount }` instead of `{ tokenId, oldDatasCount, newDatasCount }`.
3. `apps/backend/src/indexer/events.ts` — `AxiomEvent` union variant for `kind: "Updated"` updated to match (`oldRoot: 0x${string}` replaces `oldDatasCount`).
4. `apps/backend/src/routers/events.test.ts` — decode test rewritten for the new shape (encodes `bytes32 oldRoot` + single tuple[]; asserts root passthrough).
5. Frontend: grepped all `apps/frontend` references — `AGENT_NFT_ABI` is used there only for read calls (`intelligentDatasOf` etc.); **no `Updated`-event consumers exist in the frontend, no changes needed**.
6. `apps/backend/src/ws/broadcaster.test.ts` uses `"Updated"` only as an opaque topic string — no change needed.

Note: `packages/config/dist/` (compiled output the backend actually resolves) was rebuilt via `bun run build` in `packages/config`; Wave 3 must regen the deployed-ABI artifacts and redeploy the indexer config together.

---

## Finding 3 — MEDIUM: `mintWithRole(iDatas, to, creator=0)` → permanent dead tokens

**Before:** `_mintWithRole` only wrote `creators[tokenId]` when `creator != address(0)` (~L367–371). Such tokens permanently reverted `AgentCreatorNotRegistered` in `AxiomPaymentProcessor._paySplit` (the mapping read is a hardcoded invariant of the pay path) — permanently unsellable/monetizable dead tokens.

**After:** `_mintWithRole` now defaults `creator = to` when the arg is zero, exactly matching the 2-arg overload's intent (which already passes `to`). `CreatorSet` is now always emitted. Explicit non-zero creators are unchanged.

**Files:** `apps/contracts/src/AxiomAgentNFT.sol` (`_mintWithRole`); test fix in `apps/contracts/test/FuzzAxiomAgentNFT.t.sol:158` — the fuzz assertion for `creator==0` flipped from `creatorOf == 0` to `creatorOf == receiver` (the old assertion pinned the buggy behavior; that test is fork-gated and skipped in offline runs).

---

## Findings 4 & 5 — MEDIUM: Vault strategy-survival and dailySpent reset → Decision (a), document only

**Decision: option (a).** `AxiomStrategyVault` is non-upgradeable by design (ADR-004 §1.3 — the trust model IS the design; it holds user funds). Any source change would desync the repo from the deployed bytecode with no way to activate it, and the "obvious" fixes (clear `strategyRoot` on NFT transfer hook, generation-scoped `usedActions`) all require either NFT→Vault cross-contract write coupling (explicitly out of scope per lane instructions) or a redeploy. Wave 3 is redeploying the Vault anyway, so the source remains **byte-identical in logic** — the diff against `HEAD` touches only a doc-comment block (the `/// @title` line was converted to a `/// @dev` residual-risk block; zero code lines changed, zero bytecode change).

**Documented on-contract** (new `/// @dev` block on `AxiomStrategyVault`):

1. **Strategy survives iTransfer:** ownership is read live via `nft.ownerOf`, but sale does not clear `strategyRoot`/`dailyLimit` — the buyer silently inherits the seller's Merkle strategy and daily limit. Buyers MUST call `setStrategy` (or `depositAndSetStrategy`) after acquiring a token before any `execute`. **Wave 3 integration requirement:** frontend/backend must surface a "set your strategy" prompt post-purchase; the V3 Vault should clear the strategy on transfer or gate `execute` until the current owner has set one. No cross-contract write coupling was added.
2. **`dailySpent` reset on every `setStrategy`** (~L113–118, and the merged `depositAndSetStrategy` ~L130–140 / `depositSetStrategyAndWithdraw` ~L160–166 variants): the daily limit is refreshable at will by the owner and is NOT a hard invariant. The TS mirror (`packages/config/src/strategy-guard.ts`, 12 parity tests) must not assume cross-set continuity. **Wave 3 fix:** only reset `dailySpent` when the root changes (one-line change in the redeployed Vault).

**Files:** `apps/contracts/src/AxiomStrategyVault.sol` (comments only). `AxiomMockUSDC` untouched; no redeploy; no ABI regen.

---

## Finding 6 — LOW: `withdrawMintFees` dead revert stub

**Backend consumer check (grep across `apps/backend`, `apps/frontend`, `packages/config`):**

- `packages/config/src/abis/agentNft.ts:68` — the selector `"function withdrawMintFees(address) view"` is in the shared ABI (type-safe surface exists).
- `packages/config/src/abis/agentNft.ts:135` — the paired error `"error UseTimelockedFeeWithdrawal()"` is advertised.
- **No call sites** in `apps/backend/src` or `apps/frontend/src` invoke `withdrawMintFees` — the only runtime dependency is the ABI entry itself (and `test/AxiomAgentNFT.t.sol:283`, which asserts the stub reverts `UseTimelockedFeeWithdrawal`).

**After:** stub kept exactly as-is (selector preserved), NatSpec comment extended to state the function is **deprecated and scheduled for removal at the V3 deploy (W1-C)** — backend callers must migrate to the timelocked `proposeFeeWithdrawal`/`executeFeeWithdrawal` pair before that deploy, and the selector will not survive into the V3 ABI.

---

## Tests added

`apps/contracts/test/AxiomAgentNFT.t.sol` (+9 unit tests):

- `test_dataSizeCap_mint_revertsOverMax` / `_manyEntries_revertsOverMax` / `_update_revertsOverMax` / `_mintWithRole_revertsOverMax` (exact `DataSizeExceeded(provided, 4096)` revert-data assertions, both overload paths)
- `test_dataSizeCap_smallData_mintAndUpdate_succeed` (1,000-byte description passes the cap; update round-trips)
- `test_updatedEvent_update_emitsOldRootAndNewDatas` (keccak-of-old-array root asserted via `vm.expectEmit`)
- `test_updatedEvent_initialMint_emitsZeroOldRoot` (fresh mint emits `oldRoot == bytes32(0)`, deterministic tokenId via namespaced-slot read)
- `test_mintWithRole_zeroCreator_defaultsToReceiver`
- `test_mintWithRole_explicitCreator_stillRecorded`

`apps/backend/src/routers/events.test.ts`: Updated-decode test rewritten for the new event shape (net +0 tests, coverage preserved).

`apps/contracts/test/FuzzAxiomAgentNFT.t.sol`: zero-creator expectation corrected (fork-gated, skipped offline).

## Verification (fresh output)

- `forge build --force`: **Compiler run successful** (98 files, Solc 0.8.36; warnings are pre-existing OZ/assembly notices only).
- `forge test` (full suite, shared tree with concurrent lanes): **215 passed / 3 failed / 8 skipped** — the 3 failures are all in `test/AxiomTeeVerifier.t.sol` and originate from concurrent Wave-1 lane B edits to `AxiomTeeVerifier.sol`/`BaseVerifier.sol`/their tests (allowlist-cap + verifier-gate work, mid-flight at run time). They are outside lane C's file set.
- `forge test` scoped to every suite touching lane-C files (AxiomAgentNFT, FuzzAxiomAgentNFT, AxiomPaymentProcessor ×2, AxiomStrategyVault, FuzzAxiomStrategyVault, UUPSUpgrade, StorageSlot, V12C3ValidUntil, GasBenchmark, AxiomMetadataJson): **169 passed, 0 failed, 7 skipped** (skips are the pre-existing fork-gated fuzz tests). The `AxiomAgentNFTTest` suite went 48 → 57 tests, all green.
- `apps/backend` `bun test` (full suite): **175 pass, 0 fail** — matches the 175-test baseline exactly.
- `apps/backend` `bun run typecheck` (`tsc --noEmit`): clean.
- `packages/config` `bun run build`: rebuilt so `dist/` ABIs match source (required by the backend's package resolution).

## Risks

1. **Topic0 break is latent until V3 deploy.** The source event and the shared ABI now disagree with deployed bytecode. Until Wave 3's regen+redeploy, any newly indexed `Updated` logs from the *deployed* contract will fail to decode against the new ABI. Mitigation: this repo never redeploys mid-wave, and the indexer currently runs against the deployed address — the migration note above must be executed atomically with the V3 deploy (ABI regen + indexer restart).
2. **`MAX_I_DATA_BYTES` is a transition guard, not the end state.** 4096 bytes bounds today's metadata; agent *memory* (the actual V3 growth direction) still belongs in 0G Storage behind a data-root commitment (proposal 03 §2a). The cap is compile-time-settable per deploy.
3. **`oldRoot` derivation is `keccak256(abi.encode(IntelligentData[]))`** — consumers recovering old data from 0G must reproduce this exact encoding (struct field order `dataDescription, dataHash`). Documented here; not additionally exposed as a view.
4. **Zero-creator defaulting changes an observable** (`creatorOf` for `creator=0` mints flips from `address(0)` to `to`, `CreatorSet` now always emitted). The only in-repo consumer pinned to the old behavior was the fuzz test, updated. Any off-chain indexer logic assuming `CreatorSet`-absence for `creator=0` role-mints would need review at V3 deploy (none found in `apps/backend`).
5. **Vault residuals remain exploitable-by-design until Wave 3** (strategy inheritance on sale; refreshable daily limit). Both are now contract-documented and must be surfaced in the Wave 3 Vault redeploy and the FE "set your strategy" prompt.
6. **Shared-tree concurrency:** three Wave-1 lanes edited `apps/contracts/src` simultaneously; lane C verified its own scope green, but the final tree-wide green run belongs to the wave integrator once all lanes land.

## Files changed (all uncommitted)

- `apps/contracts/src/AxiomAgentNFT.sol` — `MAX_I_DATA_BYTES`, `DataSizeExceeded`, `_checkDataSize`, wired into mint/mintWithRole×2/update; zero-creator default in `_mintWithRole`; `withdrawMintFees` NatSpec
- `apps/contracts/src/extensions/ERC7857IDataStorageUpgradeable.sol` — `Updated(tokenId, oldRoot, newDatas)`; old-array commit-hash in `_updateData`
- `apps/contracts/src/AxiomStrategyVault.sol` — doc-comment residuals block only (no code change)
- `apps/contracts/test/AxiomAgentNFT.t.sol` — +9 tests
- `apps/contracts/test/FuzzAxiomAgentNFT.t.sol` — zero-creator expectation fix
- `packages/config/src/abis/agentNft.ts` — Updated ABI string (+`dist/` rebuilt)
- `apps/backend/src/indexer/events/parser.ts` — Updated decoder
- `apps/backend/src/indexer/events.ts` — `AxiomEvent` Updated variant
- `apps/backend/src/routers/events.test.ts` — decode test rewritten
- `docs/v3-proposals/waves/w1-c-data-caps-lifecycle.md` — this report
