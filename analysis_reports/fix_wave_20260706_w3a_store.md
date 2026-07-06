# Fix Wave W3-A — EventStore (`store.ts`)

**Agent:** W3-A  
**Date:** 2026-07-06  
**File:** `apps/backend/src/events/store.ts` (exclusive)  
**Manifest tasks:** BLK-1, M-12, M-22

---

## Summary

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| BLK-1 | CRITICAL | TS2451 redeclared `key`; `seenKeys.add` used bucket key instead of dedupe key | ✅ Fixed |
| M-12 | Medium | `removeFromIndex` leaked empty Map entries | ✅ Fixed |
| M-22 | Medium | `PERSIST_DIR` CWD-relative only | ✅ Fixed |

---

## BLK-1 — Dedupe key variable shadowing + wrong `seenKeys` insert

**Problem:** `append()` declared `const key` twice (lines 116 and 122), causing TS2451. Worse, `this.seenKeys.add(key)` at line 135 used the bucket key (`source::eventName`) instead of the dedupe key (`chainId:txHash:logIndex`), breaking ingest deduplication.

### Before

```typescript
append(evt: StoredEventInput): StoredEvent {
  const key = dedupeKey(evt);
  const existing = this.findByDedupeKey(key);
  if (existing) return existing;

  const stored = structuredClone(evt) as StoredEvent;
  stored.receivedAt = stored.receivedAt ?? Date.now();
  const key = `${stored.source}::${stored.eventName}`;  // TS2451 redeclaration
  let bucket = this.buckets.get(key);
  // ...
  this.seenKeys.add(key);  // BUG: bucket key, not dedupe key
```

### After

```typescript
append(evt: StoredEventInput): StoredEvent {
  const dedupe = dedupeKey(evt);
  const existing = this.findByDedupeKey(dedupe);
  if (existing) return existing;

  const stored = structuredClone(evt) as StoredEvent;
  stored.receivedAt = stored.receivedAt ?? Date.now();
  const bucketKey = `${stored.source}::${stored.eventName}`;
  let bucket = this.buckets.get(bucketKey);
  // ...
  this.seenKeys.add(dedupe);  // correct dedupe key
```

---

## M-12 — Delete empty index buckets on eviction

**Problem:** `removeFromIndex` spliced events out of `byEventName` and `byTokenId` arrays but left empty `[]` entries in the Maps.

### Before

```typescript
private removeFromIndex(evt: StoredEvent): void {
  const nameBucket = this.byEventName.get(evt.eventName);
  if (nameBucket) {
    const idx = nameBucket.indexOf(evt);
    if (idx !== -1) nameBucket.splice(idx, 1);
  }
  const tid = tokenIdFromPayload(evt.payload);
  if (tid !== null) {
    const tidBucket = this.byTokenId.get(tid);
    if (tidBucket) {
      const idx = tidBucket.indexOf(evt);
      if (idx !== -1) tidBucket.splice(idx, 1);
    }
  }
}
```

### After

```typescript
private removeFromIndex(evt: StoredEvent): void {
  const nameBucket = this.byEventName.get(evt.eventName);
  if (nameBucket) {
    const idx = nameBucket.indexOf(evt);
    if (idx !== -1) nameBucket.splice(idx, 1);
    if (nameBucket.length === 0) this.byEventName.delete(evt.eventName);
  }
  const tid = tokenIdFromPayload(evt.payload);
  if (tid !== null) {
    const tidBucket = this.byTokenId.get(tid);
    if (tidBucket) {
      const idx = tidBucket.indexOf(evt);
      if (idx !== -1) tidBucket.splice(idx, 1);
      if (tidBucket.length === 0) this.byTokenId.delete(tid);
    }
  }
}
```

---

## M-22 — `AXIOM_DATA_DIR` env override for persist path

**Problem:** Persist directory was always `join(process.cwd(), ".data")`, ignoring deployment-specific data roots.

### Before

```typescript
const PERSIST_DIR = join(process.cwd(), ".data");
```

### After

```typescript
const PERSIST_DIR = join(process.env.AXIOM_DATA_DIR ?? process.cwd(), ".data");
```

---

## Verification

### `pnpm --filter @axiom/backend typecheck`

```
$ tsc --noEmit
(exit 0)
```

**Result:** ✅ PASS — TS2451 at lines 116/122 resolved.

### `pnpm --filter @axiom/backend test`

```
ℹ tests 7
ℹ pass 7
ℹ fail 0
ℹ duration_ms 2067
(exit 0)
```

**Result:** ✅ PASS — 7/7 tests green.

---

## Issues / Notes

- No blockers remain for W3-A scope.
- BLK-1 fix unblocks manifest item **P1-2** (event dedup on ingest) — `seenKeys` now receives the correct dedupe key on append.
- No other files were modified per agent assignment.