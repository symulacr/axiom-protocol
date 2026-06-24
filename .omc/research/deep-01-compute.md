# Deep-Dive Investigation: Compute Router Integration (mig-01)

**Date:** 2026-06-24
**Investigator:** Build agent
**Scope:** Full monorepo — verify complete migration from `@0gfoundation/0g-serving-broker` / custom compute broker to 0G Compute Router API (OpenAI SDK)

---

## Status: COMPLETE (with minor bench/documentation gaps)

The production backend (`apps/backend/src/compute/router.ts`) is fully migrated to the OpenAI SDK. All source code imports and API calls use the OpenAI-compatible format. No remaining references to the old custom compute broker SDK exist in production paths.

---

## Files Checked

| File | Verdict |
|------|---------|
| `apps/backend/src/compute/router.ts` | ✅ Clean — OpenAI SDK, 76 LOC |
| `apps/backend/src/compute/` (dir) | ✅ Single file: `router.ts` only |
| `apps/backend/src/server.ts` | ✅ Imports from router.ts; uses `chat.completions.create()` |
| `apps/backend/src/orchestrator/index.ts` | ✅ Uses `createRouterClient()` → `chat.completions.create()` |
| `apps/backend/src/route-schemas.ts` | ✅ OpenAI-format schema (`model`, `messages`, `max_tokens`, `temperature`, `stream`) |
| `apps/backend/src/env-schema.ts` | ✅ Validates `AXIOM_COMPUTE_API_KEY`, `AXIOM_COMPUTE_DIRECT_KEY` |
| `apps/backend/src/env.ts` | ✅ Re-exports from `@axiom/config/env` |
| `apps/backend/package.json` | ✅ No `0g-compute-ts-sdk`; depends on `openai` v4.104.0 |
| `apps/backend/bench/` | ❌ Does not exist |
| `apps/indexer/src/` | ✅ No compute references (only `ComputeProviderPaid` on-chain event) |
| `apps/oracle/src/` | ✅ No compute references |
| `packages/config/src/env-schema.ts` | ✅ `OG_COMPUTE_BASE_URL` as optional URL |
| `packages/config/src/env.ts` | ✅ `AXIOM_COMPUTE_API_KEY`, `AXIOM_COMPUTE_DIRECT_KEY`, `OG_COMPUTE_BASE_URL` in `ENV_KEYS` |
| `packages/config/package.json` | ✅ No compute SDK |
| `.env.example` | ✅ Documents all compute env vars |
| `apps/backend/.env.example` | ✅ Documents all compute env vars |
| `apps/bench/package.json` | ⚠️ Lists `@0gfoundation/0g-compute-ts-sdk` (old SDK) |
| `apps/bench/discovery/compute-context-limits.ts` | ⚠️ Comments reference old SDK |
| `apps/bench/live-e2e/router-fallback.sh` | ⚠️ Stale — references deleted classes/files |
| `apps/bench/live-e2e/stress-compute.py` | ✅ Current endpoints, hardcoded URLs match code |
| `apps/bench/live-e2e/stress-compute.sh` | ✅ Current endpoints, hardcoded URLs match code |
| `apps/bench/scripts/*.js` | ✅ k6 load test scripts, no compute SDK refs |
| `docs/hackathon-submission.md` | ⚠️ References `@0gfoundation/0g-serving-broker` |

---

## Search Results: Old SDK Patterns

### Searched (zero matches in source code):
| Pattern | Result |
|---------|--------|
| `OpenAIClient` | ❌ **No matches** (old custom client class name) |
| `processResponse` | ❌ **No matches** (old SDK response parsing) |
| `inference` (as SDK method) | ❌ **No matches** (old SDK method) |
| `createComputeClient` | ❌ **No matches** (old factory function) |
| `0g-broker.ts` / `ZeroGCompute` / `ZeroGComputeReadOnly` / `ZeroGComputeRouter` | ❌ **No matches anywhere in repo** (deleted) |
| `0g-serving-broker` in `apps/` | ❌ **No matches** (only in `docs/`) |

### Searched (found in current router.ts — these are NEW, not old):
| Pattern | Location | Notes |
|---------|----------|-------|
| `KNOWN_PROVIDERS` | `router.ts:10` | Current code — hardcoded fallback provider URLs |
| `decodeDirectKeyToken` | `router.ts:22` | Current code — app-sk-* token decoder |
| `getComputeBaseUrl` | `router.ts:45` | Current code — URL resolution |
| `createRouterClient` | `router.ts:52` | Current code — OpenAI client factory |

### Searched (found in production code — OpenAI SDK format, correct):
| Pattern | Location | Notes |
|---------|----------|-------|
| `chat.completions.create` | `server.ts:241`, `orchestrator/index.ts:210` | ✅ OpenAI SDK format |
| `chatCompletionsSchema` | `route-schemas.ts:4`, `server.ts:28,226` | ✅ OpenAI request validation |
| `ROUTER_API_KEY` / compute key env vars | Multiple files | ✅ Documented and validated |

---

## 1. Endpoint URL Verification

### Current code URLs (from `router.ts`):
```
DEFAULT_MAINNET_URL = "https://router-api.0g.ai/v1"
DEFAULT_TESTNET_URL = "https://router-api-testnet.integratenetwork.work/v1"
Direct SDK proxy fallback = "https://compute-network-6.integratenetwork.work/v1/proxy"
```

### Official 0G Compute Router API endpoint:
```
https://router-api-testnet.integratenetwork.work
```
→ The code appends `/v1` to match the OpenAI SDK `baseURL` convention. **This is correct.**

### Hardcoded URLs in bench scripts (match current code):
| File | URL | Match? |
|------|-----|--------|
| `stress-compute.sh` | `https://compute-network-6.integratenetwork.work/v1/proxy/chat/completions` | ✅ Correct |
| `stress-compute.sh` | `https://router-api.0g.ai/v1/chat/completions` | ✅ Correct |
| `stress-compute.py` | `https://compute-network-6.integratenetwork.work/v1/proxy/chat/completions` | ✅ Correct |
| `stress-compute.py` | `https://router-api.0g.ai/v1/chat/completions` | ✅ Correct |
| `stress-compute.py` | `https://router-api-testnet.integratenetwork.work/v1/chat/completions` | ✅ Correct |

---

## 2. Remaining Issues Found

### ISSUE 1 — Docs reference old SDK name
**File:** `docs/hackathon-submission.md` (lines 140, 157)
**Evidence:**
```
140: | Compute (Router) | ✅ Operational | `@0gfoundation/0g-serving-broker`, Router API + Direct SDK |
157: - Correct 0G service usage: each integration uses the official SDK or API (0g-storage-ts-sdk, 0g-serving-broker, ERC-7857 reference).
```
**Severity:** LOW (historical document, not code)
**Recommendation:** UPDATE — replace `@0gfoundation/0g-serving-broker` with "OpenAI SDK (`openai`)" or similar.

---

### ISSUE 2 — Bench package has old SDK dependency
**File:** `apps/bench/package.json` (line 23)
**Evidence:**
```
"dependencies": {
    "@0gfoundation/0g-compute-ts-sdk": "^0.8.4",
```
**Severity:** LOW (bench/test directory, not production)
**Recommendation:** REMOVE if no bench code imports it at runtime; otherwise KEEP with note that it's bench-only. The SDK is `0.8.4` and present in `apps/bench/node_modules/`.

---

### ISSUE 3 — Bench discovery script references old SDK in comments
**File:** `apps/bench/discovery/compute-context-limits.ts` (multiple comments)
**Evidence:**
```
// `@0gfoundation/0g-compute-ts-sdk@0.8.4/lib.esm/constants.d.ts:7`).
//   - 0G Compute broker SDK reference (broker.inference.* methods):
// `@0gfoundation/0g-compute-ts-sdk@0.8.4`) is a thin wrapper around
```
**Severity:** LOW (bench only, references are in comments, actual runtime uses direct HTTP)
**Recommendation:** KEEP or CLEAN UP comments — the script makes direct HTTP calls at runtime, not SDK calls.

---

### ISSUE 4 — Bench shell script references deleted classes/files
**File:** `apps/bench/live-e2e/router-fallback.sh` (lines 98-99, 156, 162, 181, 223)
**Evidence:**
```
import { ZeroGComputeRouter } from "../../../../apps/backend/dist/compute/router.js";
import { ZeroGCompute, ZeroGComputeReadOnly } from "../../../../apps/backend/dist/compute/0g-broker.js";
```
These classes (`ZeroGCompute`, `ZeroGComputeReadOnly`, `ZeroGComputeRouter`) and the file `0g-broker.js` **no longer exist** in the backend. This script **will fail** if executed.
**Severity:** MEDIUM (bench script is broken/stale)
**Recommendation:** REMOVE or REWRITE to use the current `createRouterClient()` from `router.ts`.

---

### ISSUE 5 — Old SDK in node_modules (transitive)
**Location:** `apps/backend/node_modules/@0gfoundation/0g-compute-ts-sdk/` (v0.8.4)
**Evidence:** Present on disk. Not imported in any backend source file. Listed in `pnpm-lock.yaml` under `apps/bench` dependencies, not `apps/backend`.
**Severity:** LOW (not imported, resolves from pnpm workspace)
**Recommendation:** No action needed — will naturally be cleaned on next `pnpm install` if bench dependency is removed.

---

## 3. Overall Migration Completeness

### Production code: ✅ FULLY MIGRATED
- `router.ts` — clean OpenAI SDK integration
- `orchestrator/index.ts` — uses `chat.completions.create()` (OpenAI format)
- `server.ts` — uses `chat.completions.create()` (OpenAI format)
- `route-schemas.ts` — OpenAI-format request validation
- `env-schema.ts` — validates compute API keys
- `env.ts` / `env-schema.ts` — proper env var handling
- No imports of old SDK anywhere in `apps/backend/src/`
- `apps/backend/package.json` — no old SDK dependency

### Indexer: ✅ CLEAN (no compute references)
### Oracle: ✅ CLEAN (no compute references)
### Config: ✅ CLEAN (env vars for compute, no SDK dependency)

### Bench scripts: ⚠️ PARTIALLY STALE
- `router-fallback.sh` references deleted classes — needs update or removal
- `compute-context-limits.ts` has old SDK comments but works with direct HTTP

### Documentation: ⚠️ MINOR
- `hackathon-submission.md` mentions old SDK name

---

## Summary Recommendation

| Finding | File(s) | Action | Priority |
|---------|---------|--------|----------|
| Deleted class refs in bench script | `apps/bench/live-e2e/router-fallback.sh` | **REMOVE** or REWRITE to use `router.ts` | Medium |
| Old SDK name in docs | `docs/hackathon-submission.md` | **UPDATE** references | Low |
| Old SDK dependency | `apps/bench/package.json` | **REMOVE** if unused | Low |
| Old SDK comments | `apps/bench/discovery/compute-context-limits.ts` | **UPDATE** comments | Low |
| Transitive SDK in node_modules | N/A (pnpm-lock.yaml) | **KEEP** (auto-cleaned on next install) | None |
