# Fix Wave W6-A — Shutdown Flush & Event Cap Unification

**Agent:** W6-A  
**Date:** 2026-07-06  
**Files:** `apps/backend/src/index.ts`, `apps/backend/src/events/store.ts` (L-11 only)  
**Manifest tasks:** Shutdown flush, L-11

---

## Summary

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| — | P0 / Data integrity | `flush()` called without `await` on SIGTERM/SIGINT — events lost on shutdown | ✅ Fixed |
| L-11 | Low / Duplication | `DEFAULT_MAX_EVENTS_PER_SOURCE` duplicated `DEFAULT_EVENT_LIMIT` | ✅ Fixed |

---

## 1 — Async shutdown flush (`index.ts`)

**Problem:** W5-A made `EventStore.flush()` async (`await enqueuePersist()`), but `index.ts` still called `getEventStore().flush()` synchronously in the signal handler. The returned `Promise` was discarded, so the HTTP server could close and `process.exit(0)` run before the persist chain completed — losing events in the 2s debounce window.

**Before:**
```typescript
const onSignal = (sig: NodeJS.Signals): void => {
  console.log(JSON.stringify({ level: "info", msg: "shutdown", signal: sig }));
  getEventStore().flush();
  server.httpServer.closeAllConnections?.();
  server.httpServer.close(() => process.exit(0));
};
```

**After:**
```typescript
let shuttingDown = false;
const onSignal = (sig: NodeJS.Signals): void => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ level: "info", msg: "shutdown", signal: sig }));
  void (async () => {
    await getEventStore().flush();
    server.httpServer.closeAllConnections?.();
    server.httpServer.close(() => process.exit(0));
  })();
};
```

**Approach:**

- Signal handlers must remain sync entry points; the `void (async () => { ... })()` IIFE is the standard Node pattern for awaiting async teardown.
- `await getEventStore().flush()` cancels any pending debounce timer and waits for the serialized `persistChain` before closing connections.
- `shuttingDown` guard prevents duplicate close/exit if both SIGTERM and SIGINT arrive (common in container orchestrators).

**Behavior:** Graceful shutdown now drains the event store to disk before the process exits. No API surface change.

---

## 2 — L-11: Unify event cap constant (`store.ts`)

**Problem:** `store.ts` exported `DEFAULT_MAX_EVENTS_PER_SOURCE = 1000`, duplicating `DEFAULT_EVENT_LIMIT = 1000` in `utils/constants.ts`. The store cap and HTTP query default were the same magic number in two places.

**Before (`store.ts`):**
```typescript
export const DEFAULT_MAX_EVENTS_PER_SOURCE = 1000;
// ...
constructor(maxEventsPerSource: number = DEFAULT_MAX_EVENTS_PER_SOURCE) {
```

**After (`store.ts`):**
```typescript
import { DEFAULT_EVENT_LIMIT } from "../utils/constants.js";
// ...
constructor(maxEventsPerSource: number = DEFAULT_EVENT_LIMIT) {
```

**Approach:**

- Removed the duplicate `DEFAULT_MAX_EVENTS_PER_SOURCE` export (zero external importers per dead-code sweep).
- `EventStore` constructor default now references the canonical `DEFAULT_EVENT_LIMIT` from `constants.ts`.
- `routers/events.ts` already used `DEFAULT_EVENT_LIMIT` for query defaults — store and router now share one source of truth.

**Note:** `DEFAULT_EVENT_LIMIT` (1000) is the per-bucket retention cap; `MAX_EVENT_QUERY_LIMIT` (500) remains the HTTP query ceiling — different semantics, unchanged.

---

## Files changed

| File | Change |
|------|--------|
| `apps/backend/src/index.ts` | Async shutdown IIFE with `await flush()`, `shuttingDown` guard |
| `apps/backend/src/events/store.ts` | Import `DEFAULT_EVENT_LIMIT`; remove `DEFAULT_MAX_EVENTS_PER_SOURCE` |

---

## Verification

```bash
pnpm --filter @axiom/backend typecheck  # pass
pnpm --filter @axiom/backend test       # pass — 7/7
pnpm typecheck                          # pre-existing failure in apps/contracts (no inputs in tsconfig)
pnpm test                               # pass — backend 7/7, oracle 13/13, contracts 115 passed
```

---

## Follow-ups (out of scope)

- Root `pnpm typecheck` still fails on `@axiom/contracts` empty `include` paths (pre-existing).
- Indexer uses a `Promise.withResolvers()` shutdown pattern; backend could adopt the same top-level `main()` style in a future wave for consistency.