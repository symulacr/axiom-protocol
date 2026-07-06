# Fix Wave W5-A — EventStore Architecture (`store.ts`, `persist.ts`)

**Agent:** W5-A  
**Date:** 2026-07-06  
**Files:** `apps/backend/src/events/store.ts`, `apps/backend/src/events/persist.ts` (new)  
**Manifest tasks:** P3-1, P3-2, P3-4, P3-6

---

## Summary

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| P3-6 | Phase 3 / Arch | Split EventStore persist layer to `persist.ts` | ✅ Fixed |
| P3-4 | Phase 3 / Perf | Async persist via `fs/promises` | ✅ Fixed |
| P3-1 | Phase 3 / Perf | O(1) index removal on eviction | ✅ Fixed |
| P3-2 | Phase 3 / Perf | Owner index for `getTokenIdsByOwner` | ✅ Fixed |

---

## P3-6 — Extract persist/load layer

**Problem:** `store.ts` mixed in-memory indexing with sync filesystem I/O (`readFileSync`, `writeFileSync`, `mkdirSync`, `renameSync`).

**Approach:** New `persist.ts` owns all disk paths and I/O:

| Export | Role |
|--------|------|
| `PERSIST_FILE` | Resolved path under `AXIOM_DATA_DIR` / `.data` |
| `ensurePersistDir()` | Async `mkdir(PERSIST_DIR, { recursive: true })` |
| `loadBuckets()` | Sync read + JSON parse; quarantine corrupt files to `.bak` |
| `saveBuckets(buckets)` | Async atomic write (`writeFile` → `rename`) |

`EventStore.load()` calls `loadBuckets()` then validates events with `isStoredEvent` and rebuilds indexes. Persist errors are logged in the store layer.

---

## P3-4 — Async persist

**Problem:** Sync `writeFileSync` / `renameSync` blocked the event loop on every flush.

**Approach:**

- `saveBuckets()` uses `fs/promises` (`mkdir`, `writeFile`, `rename`).
- `enqueuePersist()` chains writes on `persistChain` so concurrent debounced flushes serialize safely.
- `persistDebounced()` fires `void enqueuePersist()` after 2s debounce; errors logged, never thrown to callers.
- `flush()` is now `async` and `await`s the persist chain (cancels pending debounce first).
- `clear()` enqueues async persist (fire-and-forget).

**Note:** `index.ts` still calls `flush()` without `await` on shutdown — out of W5-A file scope; async `flush()` remains callable synchronously (unhandled promise on signal path).

---

## P3-1 — O(1) index removal

**Problem:** `removeFromIndex` used `indexOf` + `splice` → O(n) per eviction on `byEventName` and `byTokenId`.

**Approach:**

- `WeakMap<StoredEvent, { nameIdx: number; tokenIdx?: number }>` tracks array positions.
- `removeFromIndexAt()` swaps evicted slot with last element, updates swapped event's position, then `pop()`.
- Positions updated on every `addToEventNameIndex` / `addToTokenIdIndex` push.

---

## P3-2 — `byTransferTo` owner index

**Problem:** `getTokenIdsByOwner` scanned every bucket for `Transfer` events matching `payload.to`.

**Approach:**

- New index: `byTransferTo: Map<string, Map<string, number>>` (owner lowercase → tokenId → latest `blockNumber`).
- `updateTransferToIndex()` on append/load when `eventName === "Transfer"`.
- `removeFromTransferToIndex()` on eviction: if evicted event held the recorded max block, recompute from remaining `byEventName.get("Transfer")` entries.
- `getTokenIdsByOwner()` reads the index directly, sorts by `blockNumber` desc.

---

## Files changed

| File | Change |
|------|--------|
| `events/persist.ts` | **Created** — path constants, `loadBuckets`, `saveBuckets`, `ensurePersistDir` |
| `events/store.ts` | Indexes, async persist chain, imports from `persist.ts`; removed direct `node:fs` usage |

`payloads.ts` untouched (W5-B scope).

---

## Verification

### `pnpm --filter @axiom/config build`

```
$ tsc --project tsconfig.json
(exit 0)
```

**Result:** ✅ PASS

### `pnpm --filter @axiom/backend typecheck`

```
$ tsc --noEmit
(exit 0)
```

**Result:** ✅ PASS

### `pnpm --filter @axiom/backend test`

```
ℹ tests 7
ℹ pass 7
ℹ fail 0
ℹ duration_ms ~1442
(exit 0)
```

**Result:** ✅ PASS — 7/7 tests green.

---

## Issues / Notes

- No blockers for W5-A scope.
- `flush(): Promise<void>` is a minor API change; shutdown handler may benefit from `await getEventStore().flush()` in a follow-up (W6 or server agent).
- Transfer index eviction recompute is O(Transfer events) only when the evicted row was the recorded max — acceptable given FIFO cap per source bucket.