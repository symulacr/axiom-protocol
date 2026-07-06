# Fix Wave — Agent 3 (Orchestrator & Routers)

**Date:** 2026-07-06  
**Scope:** `orchestrator/index.ts`, `routers/orchestrator.ts`, `routers/events.ts`, `routers/route-factory.ts`, `routers/performance.ts`, `route-schemas.ts`, `utils/constants.ts`  
**Audit refs:** P0-3, P0-6, P0-7 (partial), P1-3, P1-4, P1-7, P1-8, P1-9, P2-6, F-01

## Fixes Applied

### 1. P0-3 — Streaming ticks persisted to EventStore
**Before:** Streaming path only WS-published; no `events.append`.  
**After:** `appendTickEvent()` called in streaming `.then()` and non-streaming path.

### 2. P0-6 — Orchestrator uses `resolveChainId(config.chainId)`
**Before:** `config.chainId ?? GALILEO_CHAIN_ID` (ignored env).  
**After:** `resolveChainId(config.chainId)` — matches broker precedence.

### 3. P0-7 (partial) — TEE verify uses `discoverProviders` cache
**Before:** Inline `getReadOnlyBroker` + `listService()`.  
**After:** `discoverProviders(this.evmRpc, this.chainId)` with 5-min TTL cache.

### 4. P1-7 — Topic-scoped WS for orchestrator ticks
**Before:** `broadcast("orchestrator.tick", …)` to all clients.  
**After:** `sendToTopic("orchestrator.tick", …)` respects subscriptions.

### 5. P1-3 — Cap GET /v1/events limit at 500
**Added:** `MAX_EVENT_QUERY_LIMIT = 500` in constants; applied in `events.ts`.

### 6. P1-4 — Numeric `:id` validation in `createRoute`
**Before:** Non-numeric id → 500 via `BigInt` throw.  
**After:** 400 `Invalid id: must be numeric` when `requireId` set.

### 7. P1-9 — Batch performance returns HTTP 400
**Before:** HTTP 200 with `{ error: "..." }`.  
**After:** `res.status(400).json({ error: "..." })`.

### 8. P1-8 — Removed dead `paySchema` export
**Before:** Exported schema with no route.  
**After:** Removed from `route-schemas.ts`.

### 9. P2-6 — `ZERO_DATA_ROOT` constant
**Before:** Inline `"0x" + "0".repeat(64)` in 3 places.  
**After:** Shared `ZERO_DATA_ROOT` in `utils/constants.ts`.

### 10. Deduplication — `appendTickEvent` helper
Extracted shared tick persistence logic used by stream and non-stream paths.

## Verification
- `pnpm --filter @axiom/backend typecheck` — pass
- `pnpm --filter @axiom/backend test` — 7/7 pass (chainId tests confirm env precedence)

## Not in this wave (deferred)
- Full provider `selectProvider()` policy (P0-7 complete)
- Load agent `modelDataRoot` from chain (F-16)
- Event dedup on ingest (P1-2)