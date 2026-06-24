# Wave 4D — Completion Audit Report

> **Generated:** 2026-06-24  
> **Audit scope:** Waves 6–8 (commits `e018f33`..`61d1775`)  
> **Base commit:** `e018f33` (Wave 5: dead code removal + URL centralization)  
> **Head commit:** `61d1775` (Wave 8: frontend config, SSE streaming, contract tests)

---

## 1. Executive Summary

**Overall completion: ~76% of planned issues implemented across 6 plans.**

Waves 6–8 delivered **1,473 lines of production/test code** across **40 source files** (plus 18 research/plan documents in `.omc/research/`). The work spanned 6 independent but coordinated plans covering chain integration, compute, storage, DA, agentic-id, and cross-cutting concerns.

### What was accomplished

| Area | Completion | Key Deliverables |
|------|-----------|------------------|
| **Chain integration** | 9/11 issues | dRPC→official RPC in 5 Solidity tests, 6 provider hardening fixes (FetchRequest + chainId + staticNetwork), chain-aware address getters, SDK response hardening |
| **Compute** | 6/6 issues | SSE streaming + TEE attestation, on-chain provider discovery (new module), full 28+ field OpenAI schema, `KNOWN_PROVIDERS` eliminated, `decodeDirectKeyToken` hardened |
| **Storage** | ~5/10 issues | `tryDecrypt` validation guard, `ZeroGStorage`/`InMemoryStorage`/`withRetry` unified in config (partial — old files remain as re-exports), env var aliases unified, indexer dead code removed |
| **DA** | ~8.5/9 issues | Singleton `DaClient`, TLS credentials, request deadlines, health endpoint, blob size validation, env var fixes, duplicate logging removed. **Only keepalive channel options missing** |
| **Agentic ID** | ~6/13 issues | `iTransfer`/`iClone` (3-arg) added, `Transferred` event added+emitted, comprehensive test suite (iClone, revoke, delegate, operator, batch). **7 items deferred or not done** |
| **Cross-cutting** | ~5/8 items | `ENV_KEYS` expanded (~14→32), `OGNetwork` expanded (5→10 fields), 5 new resolver functions, dependencies cleaned. Backward imports, full storage file deletion, frontend explorer URLs deferred |

### LOC by wave (production code only, excluding research files)

| Wave | Description | Files | + | - | Δ |
|------|------------|------:|--:|--:|--:|
| 6 | Foundation — env vars, networks, storage, contracts | 10 | 267 | 18 | +249 |
| 7 | Backend + oracle + indexer + Solidity RPC | 26 | 589 | 214 | +375 |
| 8 | Frontend config, SSE streaming, contract tests | 5 | 617 | 29 | +588 |
| **Total** | | **40** | **1,473** | **261** | **+1,212** |

---

## 2. Per-Plan Completion Matrix

### 2.1 Chain Integration (`plan-chain.md`)

| # | Issue | Planned Files | Status | Evidence |
|---|-------|--------------|--------|----------|
| 1a | dRPC→official RPC (`FuzzAxiomTeeVerifier.t.sol:42`) | 1 file | ✅ COMPLETE | Line 42: `dRPC` → `evmrpc-testnet.0g.ai` |
| 1b | dRPC→official RPC (`V12C3ValidUntil.t.sol:23`) | 1 file | ✅ COMPLETE | Line 23: `dRPC` → `evmrpc-testnet.0g.ai` |
| 1c | dRPC in `0g.test.ts` (merged into 2e) | — | ✅ COMPLETE | Handled by 2e |
| 2a | Provider hardening (`backend/src/index.ts:12`) | 1 file | ✅ COMPLETE | `FetchRequest` + `GALILEO_CHAIN_ID` + `staticNetwork` |
| 2b | Provider hardening (`backend/src/server.ts:160`) | 1 file | ✅ COMPLETE | `FetchRequest` + `ogChainId` + `staticNetwork` |
| 2c | Provider hardening (`orchestrator/index.ts:80`) | 1 file | ✅ COMPLETE | `FetchRequest` + `staticNetwork` + async `getClient` |
| 2d | Provider + `getEnvWithAlias` (`cli/run-e2e.ts:32`) | 1 file | ✅ COMPLETE | `FetchRequest` + `OG_CHAIN_ID` + `getEnvWithAlias` |
| 2e | Provider + `resolveRpcUrl` (`storage/0g.test.ts:11-17`) | 1 file | ✅ COMPLETE | `resolveRpcUrl(GALILEO_CHAIN_ID)` + `FetchRequest` + chainId |
| 2f | `FetchRequest` timeout (`indexer/index.ts:220-222`) | 1 file | ✅ COMPLETE | `FetchRequest` timeout added (was already best-configured) |
| 3a | Aristotle placeholder addresses | — | ❌ **NOT DONE** | `0x000...000` addresses not populated (depends on Aristotle deploy) |
| 3b | Chain-aware getter functions | 1 file | ✅ COMPLETE | 5 getter functions + `@deprecated` backward-compat aliases |
| 4a | SDK response hardening (`storage/0g.ts:36-38`) | 1 file | ✅ COMPLETE | Explicit `rootHash`/`txHash` extraction with type narrowing |
| — | Additional: `FuzzAxiomStrategyVault`, `FuzzAxiomPaymentProcessor` dRPC fixes | 2 files | ✅ COMPLETE | Both also updated |
| — | Indexer env var standardization | 1 file | ✅ COMPLETE | `getEnvWithAlias` for `AXIOM_EVM_RPC`, `AXIOM_CHAIN_ID`, `AXIOM_STORAGE_RPC` |

**Completion: 9/11 (82%)** — only Issue 3a (Aristotle addresses — deployment-dependent) remains.

---

### 2.2 Compute Router (`plan-compute.md`)

| # | Issue | Priority | Status | Evidence |
|---|-------|----------|--------|----------|
| 1 | Streaming + TEE attestation | P0 | ✅ COMPLETE | SSE streaming path at `server.ts:243-301`, `x-0g-trace` extraction via `.withResponse()`, client disconnect handling |
| 2 | `decodeDirectKeyToken` fragility | P2 | ✅ COMPLETE | Field normalization: `payload.provider ?? payload.providerAddress`, `payload.address ?? payload.user` |
| 3 | On-chain provider discovery | P1 | ✅ COMPLETE | `provider-discovery.ts` created (126 lines), `KNOWN_PROVIDERS` deleted, `createRouterClient` async |
| 4 | `OG_COMPUTE_API_KEY` in schema | P3 | ✅ COMPLETE | Added to `packages/config/src/env-schema.ts` |
| 5 | Full schema (28+ OpenAI features) | P2 | ✅ COMPLETE | `route-schemas.ts` expanded with tools, streaming opts, penalties, reasoning, logprobs, etc. |
| 6 | Synthetic provider addresses | P4 | ✅ COMPLETE | `/v1/compute/providers` uses `discoverProviders()` cache with keccak256 fallback |
| — | Router URL moved to `networks.ts` | — | ✅ COMPLETE | `resolveComputeRouterUrl`, `resolveComputeDirectProxyUrl` added |

**Completion: 6/6 (100%)** — all compute issues fully implemented.

---

### 2.3 Storage Integration (`plan-storage.md`)

| # | Issue | Severity | Status | Evidence |
|---|-------|----------|--------|----------|
| 1 | Silent decryption failure guard | 🔴 CRITICAL | ✅ COMPLETE | `tryDecrypt` validation in `downloadFromStorage()` throws on failed decryption |
| 2 | Triple `ZeroGStorage` → 1 | 🔴 HIGH | ⚠️ **PARTIAL** | `packages/config/src/storage/0g.ts` rewritten with unified `ZeroGStorage` + `InMemoryStorage` + `withRetry` + `StorageAdapter`. **But** `apps/backend/src/storage/0g.ts` (2KB) and `apps/oracle/src/storage.ts` (213B) remain as re-export wrappers, NOT deleted. TODO comments left in config file. |
| 3 | Cipher mode mismatch | 🟠 HIGH | ❌ **NOT DONE** | Still using dual AES-256-CTR (SDK) + AES-256-GCM (app). Plan's Option A (align on SDK CTR) deferred. |
| 4 | Dead `submitEvent(event, {})` | 🟡 MEDIUM | ✅ COMPLETE | Indexer `composeSinks` "storage" case simplified — no-op `submitEvent` removed |
| 5 | Env var naming inconsistency | 🟡 MEDIUM | ✅ COMPLETE | Oracle `index.ts` now falls back `AXIOM_STORAGE_INDEXER_RPC` → `AXIOM_STORAGE_RPC`. Indexer uses `getEnvWithAlias("AXIOM_STORAGE_RPC", ["OG_STORAGE_RPC"])` |
| 6 | Oracle no retry (auto-fixed by consolidation) | 🟡 MEDIUM | ✅ COMPLETE | Unified `ZeroGStorage` wraps all ops in `withRetry()` |
| 7 | Duplicate `Encryption` types (auto-fixed) | 🟢 LOW | ✅ COMPLETE | Single `Encryption` type in config |
| 8 | `InMemoryStorage` moved (auto-fixed) | 🟢 LOW | ⚠️ **PARTIAL** | `InMemoryStorage` now lives in config ✅, but oracle `storage.ts` still re-exports it and backend test still imports from `./0g.js` (local file) ❌ |
| 9 | Encryption strategy (auto-fixed) | 🟢 LOW | ❌ **NOT DONE** | Depends on Issue 3 decision |
| 10 | Indexer raw Indexer (accept as-is) | 🟢 LOW | ✅ ACCEPTED | No changes needed |

**Completion: ~5/10 (50%)** with 2 items at PARTIAL and 2 at NOT DONE.

---

### 2.4 DA gRPC Integration (`plan-da.md`)

| # | Issue | Priority | Status | Evidence |
|---|-------|----------|--------|----------|
| P0 | Env var mismatch (`OG_DA_GRPC_URL` vs `DA_GRPC_URL`) | 🔴 CRITICAL | ✅ COMPLETE | `.env.example` uncommented `DA_GRPC_URL`. Code reads `DA_GRPC_URL ?? OG_DA_GRPC_URL`. |
| P1 | Singleton `DaClient` (per-event leak) | 🔴 CRITICAL | ✅ COMPLETE | `grpcClient` created once in `main()`, passed to `composeSinks` via `grpcClient` field. `DaClient.close()` called on shutdown. `makeRealSubmitterFromClient` added. |
| P1 | gRPC channel options | 🟡 MEDIUM | ⚠️ **PARTIAL** | Reconnect backoff (`initial_reconnect_backoff_ms`, `max_reconnect_backoff_ms`), retries (`enable_retries: 1`), message size limits implemented. **`grpc.keepalive_time_ms`, `grpc.keepalive_timeout_ms`, `grpc.keepalive_permit_without_calls` NOT implemented** — no keepalive pings. |
| P1 | TLS credentials | 🔴 HIGH | ✅ COMPLETE | `loadCredentials()` reads `DA_GRPC_CA_CERT` (custom CA PEM) → `createSsl(ca)`, `DA_GRPC_TLS_ENABLED` → `createSsl()`, falls back to `createInsecure()`. |
| P2 | DA env vars in shared config | 🟡 MEDIUM | ✅ COMPLETE | `ENV_KEYS` expanded with `DA_GRPC_URL`, `INDEXER_DA_ENABLED`, `DA_GRPC_CA_CERT`, `DA_GRPC_TLS_ENABLED`. Warning emitted if `INDEXER_DA_ENABLED=true` but `DA_GRPC_URL` unset. |
| P2 | Remove duplicate error logging | 🟡 MEDIUM | ✅ COMPLETE | Outer `try/catch` in `composeSinks` removed. `submitEvent()` has `@neverthrows` contract. |
| P2 | Add request deadlines | 🟡 MEDIUM | ✅ COMPLETE | `deadline` (`Date`) passed as gRPC `CallOptions` to all 3 RPC methods (`DisperseBlob`, `GetBlobStatus`, `RetrieveBlob`). Defaults: 60s disperse, 30s status/retrieve. |
| P3 | Health endpoint | 🟡 MEDIUM | ✅ COMPLETE | `startHealthServer(port, daConnected)` created. `/health` returns 200/503 based on `DaClient.connected` (`getConnectivityState`). `HEALTH_PORT` env (default 9091). Proper shutdown. |
| P4 | Blob size validation | 🟢 LOW | ✅ COMPLETE | `MAX_BLOB_SIZE_BYTES = 31_744 * 1024` guard at top of `disperseBlob`, immediate `RangeError` on oversized data. |

**Completion: ~8.5/9 (94%)** — only keepalive channel options missing from the planned spec.

---

### 2.5 Agentic ID / ERC-7857 Compliance (`plan-agentic-id.md`)

| # | Issue | Severity | Phase | Status | Evidence |
|---|-------|----------|-------|--------|----------|
| 1 | ERC-7201 storage slot mismatch | 🔴 HIGH | — | ✅ RESOLVED | Verified correct — false positive from deep trace |
| 2 | Missing `iTransfer` (3-arg) | 🔴 HIGH | P1 | ✅ COMPLETE | Added to `IERC7857.sol` + `ERC7857Upgradeable.sol`. **But implementation deviates from plan** — calls `_proofCheck` separately then 3-arg OZ `_transfer` instead of 4-arg, missing `PublishedSealedKey` emission |
| 3 | Missing `iClone` (3-arg) | 🔴 HIGH | P1 | ✅ COMPLETE | Added to `IERC7857Cloneable.sol` + `ERC7857CloneableUpgradeable.sol` |
| 4 | Missing `Transferred` event | 🔴 HIGH | P1 | ✅ COMPLETE | Added to `IERC7857.sol`, emitted in `_transfer()` and `iTransfer()` |
| 5 | `ERC7857InvalidAssistant` param fix | 🟡 MEDIUM | P1 | ❌ **NOT DONE** | DEV-NOTE added only; error signature unchanged `ERC7857InvalidAssistant()` |
| 6 | Authorization event order | 🟡 MEDIUM | P3 | ❌ **NOT DONE** | DEV-NOTE added only; event `Authorization(uint256 indexed tokenId, ...)` not reordered to EIP spec `Authorization(address indexed from, ...)` |
| 7 | `intelligentDataOf` rename/alias | 🟡 MEDIUM | P3 | ❌ **NOT DONE** | No alias added |
| 8 | Struct divergence from EIP | 🟡 MEDIUM | P5 | ❌ **NOT DONE** | Deferred to v2 per plan recommendation |
| 9 | Data hash update on transfer | 🟡 MEDIUM | P3 | ❌ **NOT DONE** | `_proofCheck` return type unchanged (still `bytes[]` not `(bytes[], IntelligentData[])`); `_transfer` does not update data hashes |
| 10 | `verifyTransferValidity` sig diff | ⚪ LOW | — | ✅ DOCUMENTED | Intentional — EIP-712 domain binding |
| 11 | `BaseVerifier` string require → custom error | ⚪ LOW | P3 | ❌ **NOT DONE** | Still using `require(!usedProofs[...], "Proof already used")` |
| 12 | `_update` missing `Transferred` | ⚪ LOW | P3 | ❌ **NOT DONE** | Not implemented |
| 13 | Test: iCloneFrom suite | 🟡 MEDIUM | P2 | ✅ COMPLETE | 10+ tests in `AxiomAgentNFT.t.sol` + 2 fuzz tests in `FuzzAxiomAgentNFT.t.sol` |
| 14 | Test: revokeAuthorization | 🟡 MEDIUM | P2 | ✅ COMPLETE | 2 tests: happy path + not-owner revert |
| 15 | Test: operator/approved transfers | 🟡 MEDIUM | P2 | ✅ COMPLETE | 2 tests: operator success + unapproved revert |
| 16 | Test: delegateAccess | 🟡 MEDIUM | P2 | ✅ COMPLETE | 2 tests: set + update |
| 17 | Test: multi-data/batch | 🟢 LOW | P2 | ✅ COMPLETE | 1 batch transfer test |

**Completion: ~6/13 (46%) of planned issues** (8/15 original issues when counting RESOLVED+DOCUMENTED as done). Phase 1 HIGH fixes mostly done (3/5). Phase 2 tests all done (5/5). Phase 3 behavioral fixes deferred (0/5). Phases 4-5 deferred.

**⚠️ Implementation bug in `iTransfer`:** The actual implementation calls `_proofCheck()` (discarding return) then 3-arg `_transfer(from, to, tokenId)` (OZ ERC721 internal) instead of the planned 4-arg `_transfer(from, to, tokenId, proofs)`. This means `PublishedSealedKey` is NOT emitted on the `iTransfer` path. The 3-arg OZ `_transfer` bypasses the custom 4-arg override that emits the event.

---

### 2.6 Cross-Cutting Redesign (`plan-cross-cutting.md`)

| # | Item | Phase | Status | Evidence |
|---|------|-------|--------|----------|
| 1 | Wrapper elimination map | P0/P6 | ⚠️ **PARTIAL** | Config unified ✅; backend + oracle old files remain as re-exports (with TODO) ❌ |
| 2 | `KNOWN_PROVIDERS` → on-chain | P0 | ✅ COMPLETE | Deleted, replaced by `provider-discovery.ts` |
| 3 | `decodeDirectKeyToken` hardened | P0 | ✅ COMPLETE | Field normalization added |
| 4 | `getComputeBaseUrl` → `networks.ts` | P0 | ✅ COMPLETE | `resolveComputeRouterUrl`, `resolveComputeDirectProxyUrl` added |
| 5 | Dead `@0gfoundation/0g-compute-ts-sdk` removed | P0 | ✅ COMPLETE | Not present in any `package.json` (already cleaned) |
| 6 | Backward import fix (`transfer.test.ts`) | P1 | ❌ **NOT DONE** | Still imports from `../../../oracle/src/` — 5 backward imports remain |
| 7 | Env var standardization — `ENV_KEYS` expansion | P0 | ✅ COMPLETE | Expanded from ~14 to 32 entries |
| 8 | `OG_COMPUTE_API_KEY` in schema | P0 | ✅ COMPLETE | Added to `sharedEnvSchema` |
| 9 | `OGNetwork` expansion (5→10 fields) | P0 | ✅ COMPLETE | 5 new fields + 5 new resolver functions |
| 10 | URL centralization — most URLs resolved | P0-P5 | ✅ COMPLETE | `resolveRpcUrl`, `resolveStorageRpc`, `resolveComputeRouterUrl`, `resolveComputeDirectProxyUrl`, `resolveBlockExplorerUrl`, `resolveExplorerApiUrl` |
| 11 | Frontend explorer URLs from resolvers | P4 | ❌ **NOT DONE** | `HistoryPage.tsx` and `MarketPage.tsx` still use hardcoded `chainscan-galileo.0g.ai` / `chainscan.0g.ai` — not using `resolveBlockExplorerUrl` |
| 12 | Dependencies: SDK removal from backend/oracle/indexer | P1-P3 | ⚠️ **PARTIAL** | `apps/backend/src/storage/0g.ts` still imports from SDK directly (re-export wrapper). Oracle `storage.ts` re-exports from config. Indexer WAS never a direct consumer (already imported from config). |

**Completion: ~9/12 items (75%)**

---

## 3. Delayed / Intentionally Deferred Issues

| Issue | Deferred To | Reason |
|-------|-------------|--------|
| Aristotle mainnet addresses (Chain 3a) | Post-Aristotle deploy | Deployment script must complete first |
| Storage cipher mode alignment (Storage 3) | Future sprint | Would change E2E test encryption flow; safe to defer |
| `ZeroGStorage` file deletion (Storage 2, Cross-cutting 1) | Wave 4 follow-up | TODO comments left; old files harmless as re-exports |
| Authorization event param order (Agentic ID 6) | Major version | ABI-breaking event signature change |
| `intelligentDataOf` rename (Agentic ID 7) | Future sprint | Adding alias is backward-compatible |
| Data hash update on transfer (Agentic ID 9) | Future sprint | Behavioral change requiring verifier update |
| `BaseVerifier` string require (Agentic ID 11) | Future sprint | Gas optimization, non-critical |
| Backward import fix (Cross-cutting 6) | Future sprint | `transfer.test.ts` works; creates package boundary violation but not runtime bug |
| Frontend explorer URL resolvers (Cross-cutting 11) | Future sprint | Hardcoded URLs work; not breaking |
| gRPC keepalive (DA P1) | Future sprint | Manual keepalive not critical for localhost dev |

---

## 4. Pre-existing Errors & Remaining Issues

### Critical / High

| # | Issue | Location | Severity | Notes |
|---|-------|----------|----------|-------|
| 1 | `iTransfer` does not emit `PublishedSealedKey` | `ERC7857Upgradeable.sol:143-151` | 🔴 HIGH | Calls 3-arg OZ `_transfer` instead of 4-arg custom override. EIP-7857 `PublishedSealedKey` event not emitted on `iTransfer` path. |
| 2 | dRPC still in `FuzzAxiomAgentNFT.t.sol` pre-existing rows in older fuzz regions? | Checked: `FuzzAxiomAgentNFT.t.sol` lines 82, 412 | ✅ FIXED | Both occurrences changed to `evmrpc-testnet.0g.ai` |
| 3 | Backward imports in `transfer.test.ts` | `apps/backend/src/server/transfer.test.ts` | 🔴 HIGH | 5 imports from `../../../oracle/src/` — creates cross-package boundary violation |
| 4 | Keepalive pings not configured in gRPC client | `da-client.ts` constructor | 🟡 MEDIUM | Dead connections undetected until next RPC attempt |
| 5 | Aristotle address placeholders | `apps/frontend/src/abi/addresses.ts` | 🟡 MEDIUM | Zero addresses will cause revert if user switches to Aristotle |

### Medium

| # | Issue | Location | Severity | Notes |
|---|-------|----------|----------|-------|
| 6 | `ERC7857InvalidAssistant()` no params | `IERC7857.sol:16` | 🟡 MEDIUM | Doesn't match EIP-7857 spec which expects `address` param |
| 7 | Authorization event param order wrong | `IERC7857Authorize.sol:18-19` | 🟡 MEDIUM | `tokenId` indexed first instead of `from` per EIP spec |
| 8 | Authorization event order in emit calls | `ERC7857AuthorizeUpgradeable.sol:62, 98` | 🟡 MEDIUM | `emit Authorization(tokenId, msg.sender, to)` — wrong order |
| 9 | Frontend explorer URLs hardcoded | `HistoryPage.tsx:38-46`, `MarketPage.tsx:48-51` | 🟡 MEDIUM | Not using `resolveBlockExplorerUrl()` |
| 10 | Storage cipher mode dual | All encryption paths | 🟡 MEDIUM | SDK AES-256-CTR + app AES-256-GCM are incompatible |

### Low

| # | Issue | Location | Severity | Notes |
|---|-------|----------|----------|-------|
| 11 | `BaseVerifier` string require | `BaseVerifier.sol:17` | 🟢 LOW | `require(!usedProofs[...], "Proof already used")` — should use custom error |
| 12 | `intelligentDataOf` (singular) missing | `IERC7857Metadata.sol` + `ERC7857Upgradeable.sol` | 🟢 LOW | Only `intelligentDatasOf` (plural) exists |
| 13 | No `Transferred` in `_update` | `AxiomAgentNFT.sol` | 🟢 LOW | Direct `transferFrom` without proofs skips `Transferred` |

---

## 5. Recommendations

### Immediate (next sprint)

1. **Fix `iTransfer` implementation** — Change from calling 3-arg OZ `_transfer` to 4-arg custom `_transfer` that emits `PublishedSealedKey`. Current implementation discards `_proofCheck` return value and misses the EIP-7857 event.

2. **Delete old storage wrappers** — Remove `apps/backend/src/storage/0g.ts` and `apps/oracle/src/storage.ts` (both are now pure re-exports of the unified config class). Update `apps/backend/src/storage/0g.test.ts` to import directly from `@axiom/config/storage/0g`.

3. **Add gRPC keepalive** — Add `grpc.keepalive_time_ms: 10_000`, `grpc.keepalive_timeout_ms: 5_000`, `grpc.keepalive_permit_without_calls: 1` to `DaClient` constructor channel options.

### Short-term

4. **Fix backward imports** — Update `apps/backend/src/server/transfer.test.ts` to import from `@axiom/oracle/*` package paths instead of `../../../oracle/src/` relative paths.

5. **Centralize frontend explorer URLs** — Replace hardcoded `chainscan-galileo.0g.ai` / `chainscan.0g.ai` in `HistoryPage.tsx` and `MarketPage.tsx` with `resolveBlockExplorerUrl(chainId)`.

6. **Add `ERC7857InvalidAssistant(address)` parameter** — Update the error declaration and ensure consistency (it's unused currently, so low risk).

### Medium-term

7. **Evaluate Phase 3 agentic ID fixes** — Decide on Authorization event reorder (ABI-breaking), `intelligentDataOf` alias, data hash update on transfer, and `Transferred` in `_update`.

8. **Align cipher modes** — Decide between SDK-native AES-256-CTR (Option A, recommended) and keeping app-level AES-256-GCM. Update E2E test accordingly.

---

## Appendix: File Change Summary

| File | Status | Wave | Change |
|------|--------|------|--------|
| `.env.example` | MODIFIED | 7 | Uncommented `DA_GRPC_URL` |
| `apps/backend/src/cli/run-e2e.ts` | MODIFIED | 7 | `FetchRequest`, `OG_CHAIN_ID`, `getEnvWithAlias`, `ZeroGStorage` import from `@axiom/config`, `ITRANSFER_FROM_ABI` from config |
| `apps/backend/src/compute/provider-discovery.ts` | **NEW** | 7 | On-chain `InferenceServing.getAllServices()` cache (126 lines) |
| `apps/backend/src/compute/router.ts` | MODIFIED | 7 | `KNOWN_PROVIDERS` deleted, `createRouterClient` async, on-chain discovery via `resolveProviderUrl` |
| `apps/backend/src/env-schema.ts` | MODIFIED | 6 | Added `OG_COMPUTE_API_KEY` |
| `apps/backend/src/index.ts` | MODIFIED | 7 | `FetchRequest`, `GALILEO_CHAIN_ID`, `staticNetwork` |
| `apps/backend/src/orchestrator/index.ts` | MODIFIED | 7 | `FetchRequest`, async `getClient`, `ZeroGStorage`/`pickOGNetwork` imports from config |
| `apps/backend/src/payment/processor.ts` | MODIFIED | 7 | ABI moved to `@axiom/config/abis` |
| `apps/backend/src/route-schemas.ts` | MODIFIED | 7 | Expanded to full 28+ OpenAI feature schema |
| `apps/backend/src/server.ts` | MODIFIED | 7 | SSE streaming, `FetchRequest`, provider discovery for `/providers`, `x-0g-trace` extraction |
| `apps/backend/src/storage/0g.test.ts` | MODIFIED | 7 | `resolveRpcUrl`, `FetchRequest`, `GALILEO_CHAIN_ID`, `staticNetwork` |
| `apps/contracts/src/ERC7857Upgradeable.sol` | MODIFIED | 6 | `iTransfer`, `Transferred` event, emit in `_transfer` |
| `apps/contracts/src/extensions/ERC7857CloneableUpgradeable.sol` | MODIFIED | 6 | `iClone` (3-arg) |
| `apps/contracts/src/interfaces/IERC7857.sol` | MODIFIED | 6 | `iTransfer` interface, `Transferred` event |
| `apps/contracts/src/interfaces/IERC7857Authorize.sol` | MODIFIED | 6 | DEV-NOTE about param order |
| `apps/contracts/src/interfaces/IERC7857Cloneable.sol` | MODIFIED | 6 | `iClone` interface |
| `apps/contracts/test/AxiomAgentNFT.t.sol` | MODIFIED | 8 | iCloneFrom, revoke, delegate, operator, batch, Transferred tests |
| `apps/contracts/test/FuzzAxiomAgentNFT.t.sol` | MODIFIED | 7+8 | dRPC→official RPC, local-deployment fuzz test contract |
| `apps/contracts/test/FuzzAxiomPaymentProcessor.t.sol` | MODIFIED | 7 | dRPC→official RPC (2 occurrences) |
| `apps/contracts/test/FuzzAxiomStrategyVault.t.sol` | MODIFIED | 7 | dRPC→official RPC |
| `apps/contracts/test/FuzzAxiomTeeVerifier.t.sol` | MODIFIED | 7 | dRPC→official RPC |
| `apps/contracts/test/V12C3ValidUntil.t.sol` | MODIFIED | 7 | dRPC→official RPC |
| `apps/frontend/src/abi/addresses.ts` | MODIFIED | 8 | 5 chain-aware getter functions + `@deprecated` aliases |
| `apps/frontend/src/components/ExecutePanel.tsx` | MODIFIED | 8 | SSE streaming checkbox, live stream output, `tickStream` support |
| `apps/frontend/src/hooks/useOrchestratorTick.ts` | MODIFIED | 8 | SSE streaming hook: `tickStream` with `onChunk`, `AbortSignal` |
| `apps/indexer/src/da-client.ts` | MODIFIED | 7 | Channel options, TLS credentials, deadlines, blob size validation, `connected` getter |
| `apps/indexer/src/da.ts` | MODIFIED | 7 | `makeRealSubmitterFromClient` added |
| `apps/indexer/src/env.ts` | MODIFIED | 7 | Re-exports `getEnvWithAlias` |
| `apps/indexer/src/index.ts` | MODIFIED | 7 | Singleton `DaClient`, health endpoint, `getEnvWithAlias`, simplified `composeSinks`, shutdown cleanup |
| `apps/indexer/da-client.env.example` | **NEW** | 7 | Environment reference for the 0G DA Client sidecar |
| `apps/oracle/src/index.ts` | MODIFIED | 7 | Storage imports from `@axiom/config/storage/0g`, env var fallback chain |
| `apps/oracle/src/storage.ts` | MODIFIED | 7 | Reduced to re-exports from `@axiom/config/storage/0g` |
| `apps/oracle/src/server-access-proof.test.ts` | MODIFIED | 7 | Storage import updated |
| `apps/oracle/src/server.test.ts` | MODIFIED | 7 | Storage import updated |
| `apps/oracle/src/server.ts` | MODIFIED | 7 | Storage import updated |
| `apps/oracle/test/server-datahash-binding.test.ts` | MODIFIED | 7 | Storage import updated |
| `packages/config/src/env-schema.ts` | MODIFIED | 6 | Added `OG_COMPUTE_API_KEY` |
| `packages/config/src/env.ts` | MODIFIED | 6 | `ENV_KEYS` expanded 14→32 entries |
| `packages/config/src/networks.ts` | MODIFIED | 6 | `OGNetwork` 5→10 fields, 5 new resolver functions |
| `packages/config/src/storage/0g.ts` | MODIFIED | 6 | Unified `ZeroGStorage`, `InMemoryStorage`, `withRetry`, `StorageAdapter`, `tryDecrypt` guard |

**Total: 40 files** (2 new, 38 modified) spanning 1,473 insertions, 261 deletions.
