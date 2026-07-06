# Fix Wave — Agent W3-C (Server & Utils)

**Date:** 2026-07-06  
**Scope:** `apps/backend/src/server.ts`, `utils/cache.ts` (new), `routers/agents.ts`, `routers/orchestrator.ts`, `routers/route-factory.ts`, `routers/health.ts`  
**Audit refs:** M2, M3, M5 (`fix_manifest.md` W3-C)

## Fixes Applied

### 1. M2 — `MAX_WS_CLIENTS` deduplication
**Before** (`server.ts`):
```typescript
const MAX_WS_CLIENTS = 1000;
```
**After:**
```typescript
import { MAX_WS_CLIENTS } from "./utils/constants.js";
// (local const removed)
```

### 2. M5 — Extract `TTLCache<T>` utility
**Created** `apps/backend/src/utils/cache.ts` with `get`/`set` and TTL expiry on read.

**Before** (`agents.ts`):
```typescript
const agentCache = new Map<string, { data: unknown; timestamp: number }>();
const AGENT_CACHE_TTL = 30_000;
// manual Date.now() comparison on get/set
```

**After:**
```typescript
const agentCache = new TTLCache<unknown>(30_000);
const cached = agentCache.get(owner);
agentCache.set(owner, result);
```

**Before** (`server.ts` payment config):
```typescript
let paymentConfigCache: { data: unknown; timestamp: number } | null = null;
const PAYMENT_CONFIG_TTL = 300_000;
```

**After:**
```typescript
const paymentConfigCache = new TTLCache<{ paymentToken: string; protocolFeeBps: bigint; protocolTreasury: string }>(300_000);
const cached = paymentConfigCache.get("config");
paymentConfigCache.set("config", result);
```

### 3. M3 — Standardize inline error responses via `sendError`
| File | Before | After |
|------|--------|-------|
| `orchestrator.ts` | `res.status(503).json({ error: "Orchestrator not available" })` | `sendError(res, 503, "Orchestrator not available")` |
| `route-factory.ts` | `res.status(400).json({ error: "Missing id" })` / invalid id | `sendError(res, 400, ...)` |
| `health.ts` | `res.status(503).json({ ok: false, error: "Health check failed" })` | `sendError(res, 503, "Health check failed")` |

## Dead Code Removed
- `const MAX_WS_CLIENTS = 1000` in `server.ts`
- `AGENT_CACHE_TTL` constant and manual timestamp checks in `agents.ts`
- `PAYMENT_CONFIG_TTL` and nullable singleton cache object in `server.ts`

## Verification
```bash
pnpm --filter @axiom/backend typecheck  # pass
```

## Not in this wave (deferred)
- Full `sendError` migration across all remaining inline `res.status().json({ error })` sites in `server.ts`
- `route-factory.ts` `requireAddress` 500 response (out of M3 scope)