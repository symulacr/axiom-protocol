# Fix Wave W5-B — P1-10 EventPayload ↔ StoredEvent Type Bridge

**Agent:** W5-B  
**Date:** 2026-07-06  
**Task:** P1-10 — Wire `EventPayload` into `StoredEvent`  
**Files:** `apps/backend/src/events/payloads.ts`, `apps/backend/src/events/store.ts` (types only)

---

## Summary

Connected the existing `EventPayload` discriminated union to the event store wire format via a minimal type alias and runtime guard. No behavioral changes to append, query, index, or persist logic.

---

## Changes

### `payloads.ts`

| Export | Description |
|--------|-------------|
| `StoredEventPayload` | Type alias: `EventPayload` — canonical payload type for stored events |
| `isEventPayload(val)` | Type guard: rejects non-objects; recognizes known payload shapes (Tick, Transfer, Deposited, Withdrawn, StrategySet, Executed); falls back to accepting any plain object as `Record<string, unknown>` |

Helpers `isPlainObject` and `hasStringFields` are module-private.

### `store.ts` (types only)

- Imported `StoredEventPayload` from `./payloads.js`
- `StoredEvent.payload` and `StoredEventInput.payload` (via `Omit`) now use `StoredEventPayload` instead of `Record<string, unknown>`
- `isStoredEvent` unchanged — still validates `payload` is a non-null object
- `tokenIdFromPayload` parameter typed as `StoredEventPayload` with internal `Record` cast (required for index-key access on the union)
- Transfer index helpers (`updateTransferToIndex`, `removeFromTransferToIndex`) use `"to" in payload` narrowing instead of direct property access

---

## W5-A Merge

W5-A had already refactored `store.ts` (persist layer extraction, O(1) index removal, `byTransferTo` owner index, async persist). W5-B changes were re-applied on top:

- No changes to `persist.ts`, index logic, or `enqueuePersist` / `loadBuckets` flow
- Only payload type line, import, `tokenIdFromPayload` signature, and `"to" in payload` guards

---

## Verification

```bash
pnpm --filter @axiom/backend typecheck
# Exit 0
```

---

## Runtime Impact

**None.** `isEventPayload` is exported for callers but not wired into `isStoredEvent` or append paths in this wave. Stored events continue to accept any JSON object payload; typed interfaces enable compile-time narrowing at consumption sites (e.g. routers) without changing store semantics.

---

## Follow-ups (out of scope)

- Use `isEventPayload` inside `isStoredEvent` for stricter load-time validation (optional)
- Replace `as Record<string, unknown>` casts in routers with `StoredEventPayload` + `payloadField` / discriminated narrowing
- Export `StoredEvent` from a shared types module if `payloads.ts` JSDoc cross-reference is desired