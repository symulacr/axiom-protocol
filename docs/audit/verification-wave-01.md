# Verification Wave 1: Critical Finding Cross-Check — Closure Report

**Date:** 2026-06-28  
**Status:** 6 CONFIRMED, 1 DISPROVEN  

---

## Results

| Agent | Finding | Verdict | Evidence |
|---|---|---|---|
| **V1-A1** | No `unhandledRejection` handler anywhere | ✅ **CONFIRMED** | Zero handlers across 93 source files + config files. Only `process.on()` calls are SIGTERM/SIGINT in oracle + indexer |
| **V1-A2** | Oracle `/v1/ownership` missing try/catch | ✅ **CONFIRMED** | 80 lines of unprotected async code (lines 152-230). `/v1/transfer-validity` has proper outer try/catch (lines 61, 125-128) — inconsistency proves gap. `/v1/agents/mint` is sync so mitigated by Express error middleware |
| **V1-A3** | OpenAI calls have no timeout | ❌ **DISPROVEN** | `createRouterClient()` passes `timeout: 30000` + `maxRetries: 2` to OpenAI constructor at `router.ts:53,63`. Client-level timeout applies to all calls |
| **V1-A4** | Backend has no SIGTERM handler | ✅ **CONFIRMED** | Backend `index.ts:1-53` and `server.ts:1-298` — zero signal handlers. Oracle has SIGTERM+SIGINT at `oracle/src/index.ts:42-51`. Indexer has SIGTERM+SIGINT at `indexer/src/index.ts:243-244` |
| **V1-A5** | 3 dead React components | ✅ **CONFIRMED** | MonoInput, MutedText, MetadataGrid — zero imports across entire frontend. No barrel re-exports, no dynamic imports |
| **V1-A6** | 5 dead bench directories | ✅ **CONFIRMED** | discovery/, micro-bench/, macro-bench/, live-e2e/, demo-video/ — not referenced from `package.json`, `Makefile`, CI workflows, or `README.md`. One internal cross-ref between demo-video and live-e2e |
| **V1-A7** | EIP-712 drift risk (3 locations) | ✅ **CONFIRMED** | Oracle `crypto/eip712.ts`, frontend `abi/eip712.ts`, Solidity `AxiomTeeVerifier.sol` — all define same types independently. Frontend imports zero types from oracle. Currently match semantically but any field change needs triple manual update |

---

## Impact on Priority Matrix

| Original Finding | Original Priority | New Priority | Reason |
|---|---|---|---|
| No `unhandledRejection` handler | P0-Critical | **P0-Critical** | ✅ Confirmed |
| Oracle try/catch gaps | P0-Critical | **P0-Critical** | ✅ Confirmed (80 lines unprotected async) |
| OpenAI no timeout | P0-Critical | ↓ **P2-Medium** | ❌ Disproven — 30s client-level timeout exists |
| Backend no SIGTERM | P0-Critical | **P0-Critical** | ✅ Confirmed |

---

## Next Steps

Launching **Wave V2: Dead Code & Smell Verification** and **Wave V3: Completeness Scan** immediately.
