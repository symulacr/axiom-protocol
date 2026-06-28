# Fix Execution Roadmap — Axiom Protocol

**Source:** Verified findings from 28-agent audit + 21-agent verification cross-check  
**Date:** 2026-06-28  
**Goal:** Systematic fix execution in 4 priority waves with per-wave validation

---

## Wave Structure

```
F1: Critical (P0) — Error handling, shutdown, data safety
  ↓ verification gate
F2: High (P1) — Refactoring, consolidation, test coverage
  ↓ verification gate  
F3: Medium (P2) — Cleanup, observability, documentation
  ↓ verification gate
F4: Low + Validation — Cosmetics, final sweep, regression tests
```

Each wave produces:
- Per-agent fix reports (one per fix task)
- Wave closure report
- Verification gate before next wave

---

## F1 — Critical (P0)

| ID | Task | File(s) | Effort | Dependencies |
|---|---|---|---|---|
| F1-A1 | Add `process.on('unhandledRejection')` + `process.on('uncaughtException')` to all 4 entry points | `apps/backend/src/index.ts`, `apps/oracle/src/index.ts`, `apps/indexer/src/index.ts`, optionally `apps/frontend/src/main.tsx` | ~1h | None |
| F1-A2 | Wrap `POST /v1/ownership` handler in outer try/catch with structured error response | `apps/oracle/src/server.ts:141-231` | ~30min | None |
| F1-A3 | Add SIGTERM/SIGINT handler to backend (close HTTP server, WS server, flush EventStore) | `apps/backend/src/index.ts`, `apps/backend/src/server.ts` | ~1h | F1-A6 (EventStore flush) |
| F1-A4 | Wrap indexer per-log decode in try/catch — skip bad log instead of crashing tick | `apps/indexer/src/watcher.ts:568-571` | ~1h | None |
| F1-A5 | Add max-fail threshold + circuit breaker to indexer retry loop | `apps/indexer/src/watcher.ts:583-605` | ~2h | None |
| F1-A6 | Add `flush()` public method to EventStore, call it on shutdown | `apps/backend/src/events/store.ts` | ~1h | F1-A3 |

## F2 — High (P1)

| ID | Task | File(s) | Effort |
|---|---|---|---|
| F2-A1 | Remove 3 dead components + 1 dead utility file | `apps/frontend/src/components/{MonoInput,MutedText,MetadataGrid}.tsx`, `apps/frontend/src/utils/events.ts` | ~15min |
| F2-A2 | Remove 5 dead bench directories from tracking | `apps/bench/{discovery,micro-bench,macro-bench,live-e2e,demo-video}/` | ~15min |
| F2-A3 | Remove `dist-test/wayback.js` and empty `dist-test/services/` | `apps/backend/dist-test/wayback.js` | ~5min |
| F2-A4 | Remove 3 unused npm deps (`omnichron`×2, bench deps) | `packages/config/package.json`, `apps/backend/package.json`, `apps/bench/package.json` | ~15min |
| F2-A5 | Remove 3 dead barrel re-exports + unused Solidity imports | `packages/config/src/abis/index.ts`, Solidity import lines | ~30min |
| F2-A6 | Remove 17 dead variables/constants | `apps/backend/src/utils/constants.ts`, `packages/config/src/networks.ts`, etc. | ~30min |
| F2-A7 | Remove 10 unreachable code paths | Solidity guards, Zod-post-parse guards, dead storage path | ~1h |

## F3 — Medium (P2)

| ID | Task | File(s) | Effort |
|---|---|---|---|
| F3-A1 | Add indexer Zod env schema (currently reads process.env directly) | `apps/indexer/src/env.ts` | ~1h |
| F3-A2 | Centralize EIP-712 domain/types in `@axiom/config` | Oracle + frontend + contracts | ~2h |
| F3-A3 | Add OpenAPI/Swagger docs for 28+ routes | All routers | ~3h |
| F3-A4 | Migrate oracle from `console.log` to structured logger | `apps/oracle/src/server.ts` | ~1h |
| F3-A5 | Add frontend tests (sampled) | `apps/frontend/src/` | ~2d |
| F3-A6 | Remove 8 transient `tmp_*` scripts at repo root | Root directory | ~5min |
| F3-A7 | Standardize env prefix — deprecate `OG_*` with runtime warnings | Throughout | ~3h |

## F4 — Low + Validation

| ID | Task | Effort |
|---|---|---|
| F4-A1 | Route path constants (replace 30+ inline strings) | ~3h |
| F4-A2 | Magic numbers → named constants | ~1h |
| F4-A3 | Per-app READMEs | ~2h |
| F4-A4 | Clean forge broadcast artifacts | ~15min |
| F4-A5 | Final validation — no regression, all tests pass | ~2h |

---

## TODO Comment Format

All TODO comments follow this format:
```typescript
// @fix {WAVE-ID}: {short description}
// @audit-ref: source agent finding reference
```

Example:
```typescript
// @fix F1-A1: Add process.on('unhandledRejection') handler
// @audit-ref: V1-A1 confirmed — zero handlers across 93 files
```

---

## Verification Gates

After each wave, run:
1. `pnpm build` — no compilation errors
2. `pnpm test` — existing tests pass
3. `pnpm typecheck` — no type errors
4. `pnpm lint` — no new lint errors

Before starting the next wave, all previous wave gates must pass.
