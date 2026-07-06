# Fix Wave — Agent 2 (Server & WebSocket)

**Date:** 2026-07-06  
**Scope:** `apps/backend/src/server.ts`  
**Audit refs:** P0-4, P0-5, P1-6 (F-02, F-03, F-14)

## Fixes Applied

### 1. P0-4 — Payment router before Sentry error handler
**Before:**
```typescript
Sentry.setupExpressErrorHandler(app);
app.use(paymentRouter);
```
**After:**
```typescript
app.use(paymentRouter);
Sentry.setupExpressErrorHandler(app);
```

### 2. P0-5 — Heartbeat eviction calls `unregisterClient`
**Before:** `wsClients.delete(c)` only.  
**After:** `unregisterClient(c)` — clears `_clientMap` and `_clientIds`.

### 3. P1-6 — Compute providers `resp.ok` check
**Before:** Parsed JSON regardless of HTTP status.  
**After:** Returns 502 with `UPSTREAM_ERROR` when router models endpoint fails.

## Verification
- `pnpm --filter @axiom/backend typecheck` — pass
- Transfer integration tests — pass

## Not in this wave (deferred)
- Chat SSE client-disconnect abort (F-15)
- `vaultExecuteSchema` (P1-5)
- `storageRpc` wiring or removal (F-06)