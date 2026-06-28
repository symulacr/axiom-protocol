# Backend Quality Report

**Date:** 2026-06-26
**Scope:** `apps/backend/src/` — 18 files + `packages/config/src/` — 19 files

---

## 1. Hardcoded Values

### Hex addresses
Only 1 instance (in `utils/constants.ts` — the Transfer event topic). This is correct — it's a well-known constant.

### Hardcoded timeouts/limits

| File | Line | Value | Context | Fix |
|------|------|-------|---------|-----|
| server.ts | 124 | `MAX_WS_CLIENTS = 1000` | WebSocket limit | Already a constant ✅ |
| server.ts | 165 | `max_tokens: 2048` | LLM max tokens | Should be configurable via env |
| server.ts | 242 | `MAX_WS_CLIENTS` | WebSocket check | Uses constant ✅ |
| route-schemas.ts | 28 | `max(10000)` | Royalty bps上限 | Schema validation — acceptable |
| broadcaster.ts | 13 | `MAX_WS_CLIENTS = 1000` | **DUPLICATE** of server.ts | Should import from one place |
| orchestrator/index.ts | 262 | `2000` | Block scan range | Should be a constant |
| events/store.ts | 11 | `DEFAULT_MAX_EVENTS_PER_SOURCE = 1000` | Event retention | Already a constant ✅ |
| routers/events.ts | 33 | `1000` | Default event limit | Should be a constant |

**Issues:**
1. `MAX_WS_CLIENTS` defined in both `server.ts` and `broadcaster.ts` — duplication
2. `max_tokens: 2048` in chat completions — should be configurable
3. Block scan range `2000` — should be a named constant
4. Default event limit `1000` — should reference `DEFAULT_MAX_EVENTS_PER_SOURCE`

---

## 2. Untyped Code

### `any` type usage: **0 instances** ✅

### `as` type assertions: **18 instances** across 9 types

| Assertion | Count | Files | Risk |
|-----------|-------|-------|------|
| `as Record<string, unknown>` | 7 | server.ts, events/store.ts | Low — guarded by `in` checks |
| `as ContractTransactionReceipt` | 3 | payment/processor.ts | Low — ethers typing |
| `as HttpServer` | 1 | server.ts | Low — createServer return |
| `as Request` | 1 | server.ts | Low — Express extension |
| `as WebSocket` | 1 | server.ts | Low — ws typing |
| `as Error` | 1 | server.ts | Low — error handler |
| Other | 4 | Various | Low |

**All assertions are guarded or on well-typed boundaries.** No unsafe casts on external input.

---

## 3. ESLint Diagnostics

**7 diagnostics in 5 files** (6 errors, 1 warning):

| File | Line | Rule | Issue |
|------|------|------|-------|
| events.ts | 2 | consistent-type-imports | `import type` should be used for type-only imports |
| events.ts | 3 | no-unused-vars | `RouteOptions` imported but unused |
| orchestrator.ts | 2 | no-unused-vars | `z` imported but unused |
| orchestrator.ts | 6 | no-unused-vars | `TickResult` imported but unused |
| provider-discovery.ts | 4 | no-unused-vars | `ethers` imported but unused |
| agents.ts | 15 | no-unused-vars | `z` imported but unused |
| route-factory.ts | 47 | no-explicit-any | `any` in route handler type (acceptable for generic handler) |

**6 unused imports, 1 type import style issue, 1 `any` in generic handler.**

---

## 4. Duplicated Patterns

### Pattern: `MAX_WS_CLIENTS` constant
Defined in both `server.ts:124` and `broadcaster.ts:13`.
**Fix:** Define once in `utils/constants.ts` and import.

### Pattern: Default event limit `1000`
Hardcoded in `routers/events.ts:33` instead of referencing `DEFAULT_MAX_EVENTS_PER_SOURCE`.
**Fix:** Import from `events/store.ts`.

### Pattern: Error response formatting
23 instances of `res.status(XXX).json({ error: "message" })` — partially migrated to `sendError()` utility.
**Remaining:** Payment routes still use raw `res.status().json()`.

### Pattern: Contract interface creation
`new ethers.Interface([...])` in `routers/agents.ts:49` — raw interface for event scanning. Acceptable since the contract doesn't have typed enumeration methods.

---

## 5. Cross-Layer Issues

### Data flow analysis

| Backend Endpoint | Frontend Hook | Issue |
|-----------------|---------------|-------|
| `GET /v1/agents` | `useAgents` | Agent listing via event scan — correct (no on-chain enumeration) |
| `GET /v1/events` | `useEventHistory` | Events fetched by frontend, filtered client-side | 
| `GET /v1/agents/:id/performance` | `usePerformance` | Single agent — correct |
| `GET /v1/agents/performance/batch` | `usePerformanceBatch` | Batch — correct |
| `POST /v1/orchestrator/tick` | `useOrchestratorTick` | Strategy execution — correct |
| `POST /v1/agents/:id/transfer` | `useTransfer` | Transfer coordination — correct |
| `GET /v1/compute/providers` | `useProviders` | Provider listing — correct |
| `GET /health` | `useHealth` | Health check — correct |

**Zero-copy issues:** None. Each endpoint has a clear purpose. The batch performance endpoint eliminates N individual calls.

### Type mismatches

| Frontend Type | Backend Type | Status |
|---------------|-------------|--------|
| `AgentInfo.tokenId: bigint` | `{ tokenId: string }` | Frontend converts with `BigInt()` — acceptable |
| `PerformanceMetrics` | Defined in `packages/config` | ✅ Shared |
| `TradeHistoryEntry` | Defined in `packages/config` | ✅ Shared |
| `AxiomEvent` | `StoredEvent` | Same structure, different names — acceptable |

---

## 6. Shared Package Analysis

### packages/config/src/types/

| File | Exports | Status |
|------|---------|--------|
| hex.ts | `Hex`, `Address` | ✅ Well-used |
| bigint.ts | `bigintReplacer` | ✅ Used in server.ts |
| schemas.ts | `hexViem`, `addressViem` | ✅ Used in route schemas |
| contract.ts | `TypedContract` | ✅ Used in 15 places |
| performance.ts | `PerformanceMetrics`, `TradeHistoryEntry` | ✅ Shared with frontend |

**No duplication between frontend and backend types.** The shared package serves as the single source of truth.

---

## 7. Recommendations (ordered by impact)

| # | Fix | Impact | Effort |
|---|-----|--------|--------|
| 1 | Remove 6 unused imports (ESLint errors) | Low | Low |
| 2 | Deduplicate `MAX_WS_CLIENTS` constant | Low | Low |
| 3 | Make `max_tokens` configurable via env | Medium | Low |
| 4 | Extract block scan range to constant | Low | Low |
| 5 | Reference `DEFAULT_MAX_EVENTS_PER_SOURCE` for default event limit | Low | Low |
| 6 | Fix `import type` style in events.ts | Low | Low |
| 7 | Migrate remaining payment routes to `sendError()` | Low | Low |
