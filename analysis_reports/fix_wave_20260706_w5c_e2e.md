# Fix Wave — Agent W5-C (E2E HTTP Helpers)

**Date:** 2026-07-06  
**Scope:** `apps/backend/src/utils/fetch-json.ts` (new), `apps/backend/src/cli/e2e/http.ts` (new), `apps/backend/src/cli/run-e2e.ts`  
**Audit refs:** P3-7, P3-5 (`fix_manifest.md` § W5-C)

## Fixes Applied

### 1. P3-7 — Shared `fetchJson<T>` helper
**File:** `utils/fetch-json.ts` (new)

**Before:** Raw `fetch().json() as T` scattered in `run-e2e.ts` with no HTTP-status awareness and unsafe JSON parsing.

**After:**
```typescript
export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: T }>
```

- Returns structured result with HTTP `ok` and `status`
- Parses JSON safely; throws on invalid JSON with URL + status context
- Empty body coerced to `{}` (same as prior implicit behavior for empty responses)

### 2. P3-5 — Extract E2E HTTP step helpers
**File:** `cli/e2e/http.ts` (new)

**Before:** `StepResult`, `stepResults`, and `postStep<T>` defined inline inside `main()` in `run-e2e.ts`.

**After:** Extracted to `cli/e2e/http.ts`:
- `StepResult` interface
- `stepResults` shared array (unchanged mutation pattern for manual + HTTP steps)
- `postStep<T>(backendUrl, step, name, body, summary)` — now takes `backendUrl` explicitly and uses `fetchJson` internally

**File:** `cli/run-e2e.ts`

- Imports `postStep` / `stepResults` from `./e2e/http.js`
- Imports `fetchJson` from `../utils/fetch-json.js`
- Health check (Step 1) uses `fetchJson` instead of raw `fetch().json()`
- Oracle mint (Step 5) uses `fetchJson` instead of raw `fetch().json()`
- All `postStep` calls pass `BACKEND_URL` as first argument
- CLI output, step numbering, and pass/fail logic unchanged

## Behavior Preservation

| Step | Change | Impact |
|------|--------|--------|
| 1 `/health` | `fetchJson` | Still reads `health.ok` from JSON body, not HTTP `ok` |
| 5 oracle mint | `fetchJson` | Still reads `mint.ok` from JSON body |
| 8–9 POST steps | `postStep` via `fetchJson` | Summary callbacks unchanged; HTTP status not consulted (same as before) |
| Manual steps 2–7, 10 | `stepResults.push` | Unchanged — still uses shared `stepResults` export |

## Verification

```bash
pnpm --filter @axiom/backend typecheck   # pass
pnpm --filter @axiom/backend test        # 7/7 pass
```

## Files Changed

| File | Changes |
|------|---------|
| `utils/fetch-json.ts` | **NEW** — `fetchJson<T>`, `FetchJsonResult<T>` |
| `cli/e2e/http.ts` | **NEW** — `StepResult`, `stepResults`, `postStep<T>` |
| `cli/run-e2e.ts` | Remove inline HTTP helpers; import + `fetchJson` for health/mint |

## Manifest Status Updates

| ID | Status |
|----|--------|
| P3-7 | Done (helper created; health + mint migrated) |
| P3-5 | Done (HTTP helpers extracted; full `main()` decomposition deferred to W6) |

## Follow-ups (W6 / out of scope)

- Extract non-HTTP step handlers from `main()` (crypto, storage, on-chain)
- Extend `fetchJson` with optional Zod schema validation (per `backend_analysis_final_report.md` P3-7 note)
- Reuse `fetchJson` in `oracle/client.ts` and other backend HTTP callers