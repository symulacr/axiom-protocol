# Wave F1: Critical P0 Fixes — Closure Report

**Date:** 2026-06-28  
**Status:** 6/6 completed | Build: ✅ passes

---

## Fixes Applied

| ID | Task | File(s) | Status |
|---|---|---|---|
| **F1-A1** | Add `process.on('unhandledRejection')` + `process.on('uncaughtException')` | All 4 entry points (`backend/index.ts`, `oracle/index.ts`, `indexer/index.ts`, `frontend/main.tsx`) | ✅ Done |
| **F1-A2** | Wrap oracle `/v1/ownership` in outer try/catch | `apps/oracle/src/server.ts` | ✅ Done |
| **F1-A3** | Add SIGTERM/SIGINT handler to backend | `apps/backend/src/index.ts` (calls EventStore.flush()) | ✅ Done |
| **F1-A4** | Wrap indexer per-log decode in try/catch | `apps/indexer/src/watcher.ts` | ✅ Done |
| **F1-A5** | Add circuit breaker + exponential backoff to indexer | `apps/indexer/src/watcher.ts` | ✅ Done |
| **F1-A6** | Add `flush()` method to EventStore | `apps/backend/src/events/store.ts` | ✅ Done |

## Verification

| Gate | Result |
|---|---|
| `pnpm build` | ✅ Passes (all TS apps + frontend Vite build) |
| TypeScript compilation | ✅ Zero errors across all apps |
| TODO comments removed | ✅ All F1 TODO comments replaced with done markers |

---

## F1-Fix Descriptions

**F1-A1 — Process error handlers**  
Added `process.on('unhandledRejection')` and `process.on('uncaughtException')` to all 4 entry points. Each logs a structured JSON error to stderr and calls `process.exit(1)`. Previously, unhandled promise rejections were silently swallowed.

**F1-A2 — Oracle try/catch**  
The `POST /v1/ownership` handler (lines 144-238) now has an outer try/catch wrapping the entire body. The existing inner try/catch for Zod validation is preserved. Non-validation errors are caught by the outer handler and returned as structured 500 JSON responses instead of raw Express HTML error pages.

**F1-A3 — Backend graceful shutdown**  
The backend's `index.ts` now captures the return value from `startServer()` and registers SIGTERM/SIGINT handlers that close all HTTP connections, flush the EventStore (via F1-A6's new `flush()` method), and exit cleanly.

**F1-A4 — Indexer per-log decode resilience**  
The `for (const log of logs)` loop in `watcher.ts` now wraps each `decodeAxiomLog()` call in a try/catch. A single malformed log no longer crashes the entire poll tick — it's skipped with a structured error log entry.

**F1-A5 — Indexer circuit breaker**  
Added `consecutiveFailures` counter and `maxConsecutiveFailures = 10` threshold to the Watcher. On failure, counter increments and exponential backoff is applied (`interval × 2^failures`, capped at 60s). After 10 consecutive failures, the watcher stops itself with a fatal log. Counter resets on successful tick. Previously it retried forever with no escalation.

**F1-A6 — EventStore flush**  
The debounce timer was refactored from a closure variable to a class field (`debounceTimer`). Added a public `flush()` method that clears the timer and synchronously calls `persist()`. The backend's new SIGTERM handler (F1-A3) calls `flush()` before shutdown to prevent in-flight event data loss.

---

## Agent Reports

| Agent | Report |
|---|---|
| F1-A1 | `local://f1-a1-unhandled-rejection-fix.md` |
| F1-A2 | `local://f1-a2-oracle-try-catch-fix.md` |
| F1-A3 | `local://f1-a3-backend-sigterm-fix.md` |
| F1-A4 | `local://f1-a4-indexer-decode-fix.md` |
| F1-A5 | `local://f1-a5-indexer-breaker-fix.md` |
| F1-A6 | `local://f1-a6-eventstore-flush-fix.md` |
