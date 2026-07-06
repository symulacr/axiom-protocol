# Fix Wave W4-E — EventStore (`store.ts`)

**Agent:** W4-E  
**Date:** 2026-07-06  
**File:** `apps/backend/src/events/store.ts` (exclusive)  
**Manifest task:** P3-3

---

## Summary

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| P3-3 | Phase 3 / Perf | Revisit `structuredClone` on every `append()` | ✅ Fixed |

---

## P3-3 — Replace `structuredClone` with shallow copy on append

**Problem:** `append()` used `structuredClone(evt)` on every ingest. That is heavier than needed for current event shapes — all known payloads (`TickPayload`, `TransferPayload`, `DepositedPayload`, etc.) are flat key/value maps with primitives and strings only.

**Requirement:** Preserve immutability — callers must not be able to mutate stored events via their input object after `append()` returns.

**Approach:** Shallow spread of top-level `StoredEvent` fields plus shallow spread of `payload` keys. This isolates stored data from caller-side mutations of top-level fields and payload keys without the allocation/serialization cost of `structuredClone`.

### Before

```typescript
/**
 * Append a new event. Deep-clones via structuredClone. Evicts oldest (FIFO)
 * when the bucket exceeds cap. Returns the stored clone.
 */
append(evt: StoredEventInput): StoredEvent {
  const dedupe = dedupeKey(evt);
  const existing = this.findByDedupeKey(dedupe);
  if (existing) return existing;

  const stored = structuredClone(evt) as StoredEvent;
  stored.receivedAt = stored.receivedAt ?? Date.now();
  const bucketKey = `${stored.source}::${stored.eventName}`;
  // ...
  stored.timestamp = Date.now();
```

### After

```typescript
/**
 * Append a new event. Shallow-clones top-level fields and payload keys so
 * callers cannot mutate stored data via their input object. Evicts oldest
 * (FIFO) when the bucket exceeds cap. Returns the stored copy.
 */
append(evt: StoredEventInput): StoredEvent {
  const dedupe = dedupeKey(evt);
  const existing = this.findByDedupeKey(dedupe);
  if (existing) return existing;

  const stored: StoredEvent = {
    ...evt,
    payload: { ...evt.payload },
    receivedAt: evt.receivedAt ?? Date.now(),
    timestamp: Date.now(),
  };
  const bucketKey = `${stored.source}::${stored.eventName}`;
```

---

## Immutability guarantee

| Mutation after `append()` | Protected? |
|---------------------------|------------|
| `evt.source = "x"` | ✅ Yes — top-level spread |
| `evt.payload.tokenId = "99"` | ✅ Yes — payload shallow copy |
| `evt.payload.nested.foo = 1` (hypothetical) | ❌ No — not needed today; no current payload uses nested objects |

Dedupe logic, persist, and index paths were **not** modified.

---

## Verification

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
ℹ duration_ms ~1812
(exit 0)
```

**Result:** ✅ PASS — 7/7 tests green.

---

## Issues / Notes

- No blockers for W4-E scope.
- Only `apps/backend/src/events/store.ts` was modified per agent assignment.
- If future payloads introduce nested objects, consider `structuredClone` only for those shapes or a targeted deep copy of nested keys.