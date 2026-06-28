# Backend & Cross-Layer Duplication Report

**Date:** 2026-06-26
**Scope:** `apps/backend/src/` (18 files) + `packages/config/src/` (19 files) + frontend-backend data flow

---

## Executive Summary

The backend has **23 repeated error response patterns**, **57 console.log/warn/error calls** (should use structured logging), **4 `any` type usages**, and **2 potentially orphaned endpoints**. The cross-layer analysis reveals **11 frontend API URLs** mapping to **8 backend endpoints**, with **2 endpoints having no direct frontend consumer**.

Key findings:
1. **server.ts is 800+ lines** — should be split into route modules
2. **23 error response patterns** — extract `sendError(res, status, message)` utility
3. **57 console calls** — migrate to structured logging (slog-style or pino)
4. **2 orphaned endpoints** — `/v1/agents/:id/transfer` and `/v1/chat/completions` may be consumed by external tools
5. **Type mismatches** — frontend defines `AgentInfo` with `tokenId: bigint`, backend returns `tokenId: string`

---

## Part 1: Backend Duplication

### 1. Duplicated Patterns in server.ts

**server.ts is 807 lines.** It contains:
- 8 route handlers inline
- Request logging middleware
- Error handling middleware
- WebSocket setup
- Health endpoint delegation
- Agent listing (complex, ~70 lines)
- Transfer coordination (~100 lines)
- Performance endpoint (~40 lines)

**Repeated patterns:**

#### Error response pattern (23 instances)
```typescript
res.status(XXX).json({ error: "message" });
```
Instances at lines: 59, 233, 260, 314, 349, 353, 377, 433, 439, 490, and 13 more.

**Fix:** Extract `sendError(res, status, message)` utility function.

#### Request validation pattern
Multiple routes manually check `req.params.id`, `req.query.owner`, etc. The `createRoute` helper handles some of this, but raw `app.get`/`app.post` routes do it manually.

**Fix:** Route all endpoints through `createRoute` for consistent validation.

#### Console logging (57 instances)
```typescript
console.log(`[${req.method}] ${req.originalUrl} ...`);
console.warn("[transfer] ...");
console.error("[server] error:", err);
```

**Fix:** Migrate to structured logging (pino or similar). Each log should include: timestamp, level, component, message, structured context.

### 2. Duplicated Patterns Across Files

#### Contract interaction patterns
Both `orchestrator/index.ts` and `payment/processor.ts` create ethers `Interface` instances and call contracts. The pattern:
```typescript
const iface = new ethers.Interface([...]);
const result = await provider.call({ to: addr, data: iface.encodeFunctionData(...) });
const decoded = iface.decodeFunctionResult(...);
```

This appears in:
- `server.ts:499-504` (agent listing)
- `server.ts:529-530` (ownerOf check)
- `server.ts:540-543` (intelligentDatasOf)
- `orchestrator/index.ts` (vault execute)
- `payment/processor.ts` (payment processing)

**Fix:** The `TypedContract` from `packages/config/types/contract.ts` exists but isn't used consistently. Migrate all contract interactions to use it.

#### Error handling in orchestrator
`orchestrator/index.ts` has multiple try/catch blocks with similar error formatting patterns.

### 3. Hardcoded Values

#### In server.ts
- `"0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"` (Transfer event topic) — line 512. Should be a constant.
- `"0x" + "00".repeat(12) + owner!.slice(2)` — line 513. Address padding logic should be a utility.
- `100` (max tokens to enumerate) — line 534. Should be a configurable constant.
- `30_000` (poll interval) — line 38 in useVaultData. Already a constant, good.

#### In orchestrator/index.ts
- `"qwen/qwen2.5-omni-7b"` — default model. Should come from config.
- Various timeout values.

#### In event store
- `DEFAULT_MAX_EVENTS_PER_SOURCE = 1000` — already a constant, good.

### 4. Untyped Code

**`any` usage: 4 instances**

| Location | Code | Risk |
|----------|------|------|
| `server.ts:72` | `(req as any).requestId = requestId` | Medium — Express Request extension |
| `server.ts:586` | `(e: any) => { ... }` | Low — event filter callback |
| `provider-discovery.ts:36` | `(s: any) => ({ ... })` | Low — API response mapping |
| `provider-discovery.ts:82` | `(s: any) =>` | Low — service lookup |

**Fix:** Extend Express Request interface for requestId. Type the provider-discovery response.

---

## Part 2: Frontend-Backend Data Flow

### 5. Zero-Copy Issues

#### Issue 1: Agent listing via backend proxy
**Frontend:** `useAgents` → `GET /v1/agents?owner=...`
**Backend:** Queries Transfer events, calls `ownerOf` for each, calls `intelligentDatasOf` for each

The backend does 1 + N + N RPC calls (balanceOf + N×ownerOf + N×intelligentDatasOf). The frontend could do this directly via wagmi's `useReadContracts` if the contract supported enumeration. Since it doesn't (no `tokenOfOwnerByIndex`), the backend proxy is correct architecture.

**However:** The backend could cache the result. Currently, every `/v1/agents` call re-scans Transfer events from block 0. Adding a simple TTL cache (30s) would eliminate repeated scanning.

#### Issue 2: Vault data fetched individually
**Frontend:** Each agent card calls `useVaultData(tokenId)` → `useReadContracts` → 2 RPC calls per agent
**Impact:** With 10 agents, that's 20 RPC calls on page load

**Fix:** Create `useVaultDataBatch(tokenIds)` that multicalls all `balanceOf` + `strategyOf` in a single `useReadContracts` call with 20 contracts.

#### Issue 3: Performance data fetched individually
**Frontend:** Each agent card calls `usePerformance(tokenId)` → `GET /v1/agents/:id/performance`
**Impact:** With 10 agents, that's 10 HTTP requests on page load

**Fix:** Create batch endpoint `GET /v1/agents/performance?ids=1,2,3,...` that returns all agents' metrics in one response.

#### Issue 4: Health endpoint polled twice
**Frontend:** HealthBadge and AgentDetail both call `useHealth()`
**Impact:** Low — react-query likely deduplicates. Verify.

### 6. Type Mismatches

| Frontend type | Backend type | Issue |
|---------------|-------------|-------|
| `AgentInfo.tokenId: bigint` | `{ tokenId: string }` | Frontend converts with `BigInt()` in useAgents |
| `AxiomEvent.payload: Record<string, unknown>` | `StoredEvent.payload: Record<string, unknown>` | Match ✅ |
| `PerformanceMetrics` (frontend) | No backend type export | Frontend defines its own |
| `TradeHistoryEntry` (frontend) | No backend type export | Frontend defines its own |

**Fix:** Export `PerformanceMetrics` and `TradeHistoryEntry` types from backend (or shared package) so frontend imports them directly instead of redefining.

### 7. API Surface Analysis

| Endpoint | Method | Frontend consumer | Status |
|----------|--------|-------------------|--------|
| `/v1/agents` | GET | `useAgents` | ✅ Active |
| `/v1/agents/:id/performance` | GET | `usePerformance` | ✅ Active |
| `/v1/agents/:id/transfer` | POST | `useTransfer` (via oracle) | ⚠️ Indirect |
| `/v1/chat/completions` | POST | ChatPage (via SSE) | ⚠️ Indirect |
| `/v1/compute/providers` | GET | `useProviders` | ✅ Active |
| `/v1/events` | POST | Indexer (not frontend) | ✅ Active |
| `/v1/events` | GET | `useEventHistory` | ✅ Active |
| `/v1/orchestrator/tick` | POST | `useOrchestratorTick` | ✅ Active |

**Orphaned endpoints:** None truly orphaned. `/v1/agents/:id/transfer` is consumed by the frontend's `useTransfer` hook (which calls the oracle, not the backend directly). `/v1/chat/completions` is consumed by ChatPage via SSE streaming.

**Missing endpoints:**
- `GET /v1/agents/performance?ids=...` — batch performance (would eliminate N API calls)
- `GET /v1/agents/:id/events` — per-agent events (would eliminate client-side filtering)

---

## Part 3: Cross-Layer Elegance

### 8. Shared Package Analysis

`packages/config/src/` contains 19 files:

| Module | Purpose | Assessment |
|--------|---------|------------|
| `abis/` | Contract ABIs (6 files, 64KB generated) | Well-organized |
| `addresses.ts` | Deployed contract addresses | Clean |
| `networks.ts` | Chain config (Galileo, Aristotle) | Clean |
| `env.ts` / `env-schema.ts` | Environment config | Clean |
| `storage/0g.ts` | 0G Storage adapter | Clean |
| `types/` | Shared types (hex, bigint, contract, schemas) | Clean |
| `middleware/auth.ts` | API key auth | Clean |

**Duplication found:**
- `abis/generated.ts` (64KB) contains ALL generated ABI types. The individual ABI files (`agentNft.ts`, `vault.ts`, etc.) re-export from it. This is correct — generated file + typed re-exports.

**Missing from shared package:**
- `PerformanceMetrics` type (defined in frontend only)
- `TradeHistoryEntry` type (defined in frontend only)
- `AgentInfo` type (defined in frontend only)
- `StoredEvent` type (defined in backend only, frontend re-defines as `AxiomEvent`)

**Fix:** Export these types from `packages/config/src/types/` so both frontend and backend import from the same source.

### 9. Import/Module Analysis

#### Backend
- **Unused imports:** 0 detected
- **Circular dependencies:** None detected
- **Missing barrel exports:** `routers/` has no barrel; `compute/` has no barrel. Each consumer imports directly.

#### Frontend
- **Unused imports:** 0 detected
- **Circular dependencies:** None detected
- **Missing barrel exports:** `hooks/` has no barrel (17 files). Acceptable at current scale.

---

## Recommendations (ordered by impact)

| # | Fix | Impact | Effort | Lines saved |
|---|-----|--------|--------|-------------|
| 1 | Extract `sendError(res, status, msg)` utility | High | Low | ~45 (23 instances × 2 lines) |
| 2 | Split server.ts into route modules | High | Medium | ~0 (readability, not LOC) |
| 3 | Migrate console.log to structured logging | High | Medium | ~0 (observability, not LOC) |
| 4 | Batch vault data endpoint/hook | High | Medium | ~30 + RPC efficiency |
| 5 | Batch performance endpoint/hook | High | Medium | ~20 + API efficiency |
| 6 | Export shared types from packages/config | Medium | Low | ~50 (eliminate redefinitions) |
| 7 | Type event payloads (eliminate `as Record<string, unknown>`) | Medium | Low | ~25 |
| 8 | Cache agent listing (TTL on Transfer event scan) | Medium | Low | ~0 (performance) |
| 9 | Migrate all contract calls to TypedContract | Medium | Medium | ~30 |
| 10 | Extract Transfer event topic constant | Low | Low | ~2 |
