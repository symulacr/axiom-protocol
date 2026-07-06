# Fix Wave — Agent W3-D (Config / Indexer / Frontend)

**Date:** 2026-07-06  
**Scope:** `packages/config/src/env.ts`, `packages/config/src/middleware/auth.ts`, `apps/indexer/src/sink.ts`, `apps/indexer/src/index.ts`, `apps/frontend/src/hooks/usePerformanceBatch.ts`  
**Audit refs:** H8, L11, L7, M11, F-17-FE (`fix_manifest.md` § W3-D)

## Fixes Applied

### 1. H8 — `getEnvWithAlias` deprecation warning
**File:** `packages/config/src/env.ts`  
**Before:** Returned alias values silently.  
**After:** When a non-canonical alias resolves, emits:
`console.warn('[config] DEPRECATED: env var "<alias>" is deprecated, use "<canonical>"')`.

### 2. L11 — Configurable public paths in API key auth
**File:** `packages/config/src/middleware/auth.ts`  
**Before:** Hardcoded `req.path === "/health"`.  
**After:** `createApiKeyAuth(apiKey, publicPaths = ["/health"])` — checks `publicPaths.includes(req.path)`.  
Backward-compatible: existing callers unchanged (default still skips `/health`).

### 3. L7 — Indexer HTTP sink retry with exponential backoff
**File:** `apps/indexer/src/sink.ts`  
**Before:** Single fetch attempt; duplicate `return { status: res.status };` at end.  
**After:**
- Added `maxRetries?: number` to `HttpEventSinkOptions` (default `2`).
- Retry loop retries on 5xx and network errors with backoff `500ms × 2^attempt`.
- Removed duplicate return statement.

### 4. M11 — Indexer event buffer re-insertion (H4 fix)
**File:** `apps/indexer/src/index.ts:76-88`  
**Before:** On flush failure, `pop()` dropped newest events, then `unshift(...batch)` prepended old batch.  
**After:** `shift()` drops oldest events while `length + batch.length > MAX_BUFFER_SIZE`, then `push(...batch)` appends failed batch at end — preserves chronological order and keeps newest events.

### 5. F-17-FE — `NULL_METRICS` missing `buyRate`
**File:** `apps/frontend/src/hooks/usePerformanceBatch.ts`  
**Before:** `NULL_METRICS` lacked `buyRate` required by `PerformanceMetrics`.  
**After:** Added `buyRate: 0` alongside deprecated `winRate: 0`.

## Verification

| Command | Result |
|---------|--------|
| `pnpm --filter @axiom/config build` | ✅ Pass |
| `pnpm --filter @axiom/indexer typecheck` | ✅ Pass |
| `pnpm --filter @axiom/backend typecheck` | ❌ Pre-existing: `server.ts:471` `protocolFeeBps` bigint vs number (W3-C scope) |
| `pnpm --filter @axiom/frontend typecheck` | ❌ Pre-existing: `PaymentPanel.tsx:86` arithmetic type (unrelated) |

W3-D changes introduce no new type errors in owned files.

## Manifest Status Update

| ID | Status |
|----|--------|
| H8 | Done |
| L11 | Done |
| L7 | Done |
| M11 | Done |
| F-17-FE | Done |