# Fix Wave — Agent 1 (EventStore)

**Date:** 2026-07-06  
**Scope:** `apps/backend/src/events/store.ts`, `apps/backend/src/events/payloads.ts`  
**Audit refs:** C-1, C-2, C-3 (partial), M-1, P0-1, P0-2, P1-10 (payloadNumber)

## Fixes Applied

### 1. P0-1 — Corrupt persist file logging + quarantine (C-1)
**Before:** Silent `catch {}` on load failure.  
**After:** `log.warn` + rename corrupt file to `events.json.bak`.

### 2. P0-1 — Atomic persist writes
**Before:** Direct `writeFileSync(PERSIST_FILE, ...)`.  
**After:** Write to `.tmp` then `renameSync` to target.

### 3. P0-2 — Defensive copy on query returns (C-2)
**Before:** `queryBySource` returned live bucket reference.  
**After:** `return [...bucket]`. `getAll` eventName branch also returns copy.

### 4. M-1 — `clear()` syncs disk
**Before:** Cleared memory only; stale file on restart.  
**After:** Calls `persist()` after clearing indexes.

### 5. payloadNumber NaN guard
**Before:** `Number("foo")` returned `NaN`.  
**After:** `Number.isFinite` check in `payloads.ts`.

## Verification
- `pnpm --filter @axiom/backend typecheck` — pass
- `pnpm --filter @axiom/backend test` — 7/7 pass

## Not in this wave (deferred)
- Runtime schema validation on `load()` (P1-1)
- O(1) index removal (P3-1)
- `structuredClone` revisit (P3-3)