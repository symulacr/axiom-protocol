# Fix Wave — Agent 4 (Config Security & Duplication)

**Date:** 2026-07-06  
**Scope:** `packages/config/src/middleware/auth.ts`, `packages/config/src/env.ts`, `services/wayback.ts`, `compute/router.ts`, `compute/provider-discovery.ts`  
**Audit refs:** C1 (implementation plan), H5 (env quotes), F-01, F-02, F-19, F-26

## Fixes Applied

### 1. Critical — Timing-safe API key comparison
**File:** `packages/config/src/middleware/auth.ts`  
**Before:** `if (key !== apiKey)`  
**After:** `timingSafeEqual` on equal-length `Buffer` comparison.

### 2. High — `.env` quoted value stripping
**File:** `packages/config/src/env.ts`  
**Before:** `const val = trimmed.slice(eq + 1).trim()`  
**After:** Strip surrounding `'` or `"` via regex.

### 3. P2-1 — Wayback CDX deduplication
**Extracted:**
- `fetchCdxRows(cdxUrl)` — shared fetch/parse pipeline
- `waybackTimestampToIso(ts)` — shared timestamp formatting

**Before:** Exact copy-paste in `lookupSnapshots` and `lookupAccountTweets`.  
**After:** Both call shared helpers.

### 4. P2-7 — Distinct logger component names
**Before:** `provider-discovery.ts` and `router.ts` both used `"compute"`.  
**After:** `"provider-discovery"` and `"compute-router"`.

### 5. F-26 — Remove unused `GALILEO_CHAIN_ID` import
**File:** `compute/router.ts` — import removed (chain default via `resolveChainId()`).

## Verification
- `pnpm --filter @axiom/config build` — pass
- `pnpm --filter @axiom/backend typecheck` — pass

## Not in this wave (deferred)
- Oracle `request<T>()` consolidation (P2-4)
- Payment `findParsedEvent` + `sendAndWait` (P2-3)
- `buildOpenAIClient` helper (P2-5)