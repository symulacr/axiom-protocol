# Quality, Types & Architecture Analysis Report

**Agent:** Sub-Agent 3 — Quality, Types & Architecture  
**Date:** 2026-07-05  
**Scope:** Partitioned backend files (7 files, read line-by-line)  
**Status:** Analysis only — no fixes implemented

---

## 1. Executive Summary

This partition spans the **event persistence layer** (`store.ts`), **typed payload definitions** (`payloads.ts`), **shared utilities** (`logger.ts`, `constants.ts`, `response.ts`), an **E2E CLI harness** (`run-e2e.ts`), and **transfer integration tests** (`transfer.test.ts`).

**Overall assessment:** The codebase shows deliberate architectural choices (multi-index in-memory store, typed payload interfaces, component-scoped logging) but suffers from **type-safety gaps at system boundaries** (HTTP/JSON, disk persistence), **performance anti-patterns in hot paths** (full scans, array spreads, O(n) index maintenance), and **separation-of-concerns debt** concentrated in `EventStore` and `run-e2e.ts` `main()`.

| Severity   | Count |
|------------|-------|
| Critical   | 3     |
| High       | 9     |
| Medium     | 14    |
| Low        | 11    |
| Cosmetic   | 5     |

**Top risks:**
1. Silent persistence corruption/data loss (`store.ts`)
2. Mutable internal arrays leaked via `readonly` return types (`store.ts`)
3. Unvalidated HTTP response typing across CLI and tests (`run-e2e.ts`, `transfer.test.ts`)
4. `payloads.ts` typed interfaces disconnected from `EventStore` opaque payloads
5. `main()` god-function in E2E CLI (400+ lines in one function)

**No explicit `any` usage** was found in the scoped files. Loose typing manifests via `unknown`, `Record<string, unknown>`, and unchecked `as T` assertions.

---

## 2. Partition Scope

| File | Lines | Role |
|------|-------|------|
| `apps/backend/src/events/store.ts` | 323 | In-memory event store with persistence, indexing, eviction |
| `apps/backend/src/events/payloads.ts` | 75 | Typed event payload interfaces and safe field extractors |
| `apps/backend/src/utils/logger.ts` | 36 | Component-scoped console logger |
| `apps/backend/src/utils/constants.ts` | 13 | Shared numeric/string constants |
| `apps/backend/src/utils/response.ts` | 14 | Express error helpers |
| `apps/backend/src/cli/run-e2e.ts` | 519 | End-to-end protocol CLI harness |
| `apps/backend/src/server/transfer.test.ts` | 370 | Transfer route integration tests |

---

## 3. Findings by Severity

### Critical

#### C-1: Silent discard of corrupt or invalid persisted events
**File:** `store.ts:195-214`

```typescript
private load(): void {
  try {
    if (!existsSync(PERSIST_FILE)) return;
    const raw = readFileSync(PERSIST_FILE, "utf-8");
    const data = JSON.parse(raw) as Record<string, StoredEvent[]>;
    // ... rebuild indexes ...
  } catch {
    // File missing or corrupt — start fresh.
  }
}
```

**Issue:** Any parse error, schema mismatch, or partial write results in **complete data loss with no logging**. Production restarts after crash mid-write lose all persisted events silently.

**Microchange direction:** Log corruption via `log.warn`; optionally quarantine corrupt file (`events.json.bak`); validate parsed shape before accepting; consider atomic write (write-temp-then-rename) in `persist()`.

---

#### C-2: `readonly` return types expose mutable internal array references
**File:** `store.ts:102-106`, `111-124`, `126-146`

```typescript
queryBySource(source: string, eventName: string): readonly StoredEvent[] {
  const bucket = this.buckets.get(`${source}::${eventName}`);
  if (bucket === undefined) return [];
  return bucket;  // same array reference held by store
}
```

**Issue:** Callers receive the **live internal bucket array**. `readonly` only prevents reassignment of the array reference, not `push`/`splice`/`sort` on elements. External mutation corrupts indexes, eviction order, and persistence.

**Microchange direction:** Return `Object.freeze([...bucket])`, a shallow copy, or document + runtime freeze in dev; prefer `ReadonlyArray<Readonly<StoredEvent>>` with defensive copies on hot read paths.

---

#### C-3: Debounced persistence window allows data loss on crash
**File:** `store.ts:268-271`, `274-281`

```typescript
private persistDebounced(): void {
  if (this.debounceTimer) clearTimeout(this.debounceTimer);
  this.debounceTimer = setTimeout(() => this.persist(), 2_000);
}
```

**Issue:** Events appended within 2s of process termination (SIGKILL, OOM, container stop) are **never flushed**. `flush()` exists but the singleton (`getEventStore`) provides no shutdown hook in this file.

**Microchange direction:** Register `process.on('beforeExit'/'SIGTERM')` handler calling `flush()`; reduce debounce for critical events; or use synchronous append-to-WAL pattern.

---

### High

#### H-1: `JSON.parse` + unchecked type assertion on disk load
**File:** `store.ts:198-199`

```typescript
const raw = readFileSync(PERSIST_FILE, "utf-8");
const data = JSON.parse(raw) as Record<string, StoredEvent[]>;
```

**Issue:** No runtime validation that loaded objects satisfy `StoredEvent` shape. Malformed `payload`, missing `timestamp`, or wrong value types pollute indexes and cause downstream runtime errors.

**Microchange direction:** Add a `isStoredEvent` type guard or Zod schema; skip/repair invalid entries rather than wholesale discard.

---

#### H-2: `structuredClone` on every `append` — unnecessary copy hot path
**File:** `store.ts:79-80`

```typescript
append(evt: StoredEventInput): StoredEvent {
  const stored = structuredClone(evt) as StoredEvent;
```

**Issue:** Full deep clone on every append duplicates `payload` objects already deserialized from chain/indexer. Under high event throughput this is a **memory and CPU tax** with no documented caller-mutation contract.

**Microchange direction:** Shallow copy + immutable payload convention; clone only `payload` if needed; or accept `StoredEventInput` with `Object.freeze` after normalization.

---

#### H-3: O(n) index removal via `indexOf` + `splice` on eviction
**File:** `store.ts:235-248`

```typescript
private removeFromIndex(evt: StoredEvent): void {
  const nameBucket = this.byEventName.get(evt.eventName);
  if (nameBucket) {
    const idx = nameBucket.indexOf(evt);
    if (idx !== -1) nameBucket.splice(idx, 1);
  }
  // same pattern for byTokenId
}
```

**Issue:** FIFO eviction at cap triggers linear scan in **two** secondary indexes per evicted event. At `DEFAULT_MAX_EVENTS_PER_SOURCE = 1000` and many tokenIds, eviction cost grows with index size.

**Microchange direction:** Maintain `Map<StoredEvent, index>` side structures; use doubly-linked list for O(1) removal; or accept lazy index rebuild on query.

---

#### H-4: `getAll()` without `eventName` copies every bucket via spread
**File:** `store.ts:137-140`

```typescript
let all: StoredEvent[] = [];
for (const bucket of this.buckets.values()) {
  all.push(...bucket);
}
```

**Issue:** Full materialization of all events into a new array on every unscoped `getAll()` call. Combined with sort (line 145), this is **O(N log N) memory + CPU** per poll.

**Microchange direction:** Merge sorted bucket iterators; maintain global sorted view incrementally; paginate with cursor.

---

#### H-5: `getTokenIdsByOwner` full-table scan across all buckets
**File:** `store.ts:153-175`

```typescript
getTokenIdsByOwner(owner: string, limit?: number): Array<{ tokenId: string; blockNumber: number }> {
  const seen = new Map<string, number>();
  for (const bucket of this.buckets.values()) {
    for (const evt of bucket) {
      if (evt.eventName !== "Transfer") continue;
      // ...
    }
  }
```

**Issue:** No `byOwner` or Transfer-specific index. Every owner lookup scans **all stored events** despite comment acknowledging DB would be authoritative.

**Microchange direction:** Add `Map<ownerLower, tokenId→blockNumber>` index updated on Transfer append/evict; or cap scan with early exit heuristics.

---

#### H-6: `payloads.ts` typed interfaces disconnected from `EventStore`
**File:** `payloads.ts:44-51` vs `store.ts:24`

```typescript
// payloads.ts
export type EventPayload = TickPayload | TransferPayload | ... | Record<string, unknown>;

// store.ts
payload: Record<string, unknown>;
```

**Issue:** Typed payload work is **orphaned** from the store layer. Store cannot leverage discriminated unions; consumers must cast or use loose `Record<string, unknown>`.

**Microchange direction:** Parameterize `StoredEvent<T extends EventPayload>` or use `eventName` as discriminant with mapped payload types; bridge `tokenIdFromPayload` with `TransferPayload`.

---

#### H-7: `EventPayload` union includes `Record<string, unknown>` escape hatch
**File:** `payloads.ts:44-51`

```typescript
export type EventPayload =
  | TickPayload
  | TransferPayload
  | ...
  | Record<string, unknown>;
```

**Issue:** The final union member **absorbs all types**, preventing exhaustive narrowing. TypeScript will not force handling of known event kinds.

**Microchange direction:** Replace with `| { [key: string]: unknown }` only at ingestion boundary; use discriminated union on `eventName`; separate `KnownEventPayload` from `UnknownPayload`.

---

#### H-8: E2E `main()` god-function — 400+ lines, mixed concerns
**File:** `run-e2e.ts:103-516`

```typescript
// FLAG: main() is 263 lines — exceeds 100-line threshold. Consider extracting step handlers.

async function main(): Promise<void> {
  // health, encrypt, upload, mint, tick, transfer challenge/final, on-chain tx, summary
}
```

**Issue:** Single function owns HTTP orchestration, cryptography, storage I/O, on-chain calls, and reporting. Comment understates current size (~413 lines). Untestable units, high merge conflict risk.

**Microchange direction:** Extract `steps/health.ts`, `steps/transfer.ts`, etc.; pass shared `E2EContext`; keep `main()` as thin coordinator.

---

#### H-9: HTTP fetch responses cast with `as T` — no status or schema validation
**File:** `run-e2e.ts:131-137`, `transfer.test.ts:110-117`

```typescript
const res = (await (
  await fetch(`${BACKEND_URL}${name}`, { ... })
).json()) as T;
```

**Issue:** Non-2xx responses, HTML error pages, and malformed JSON are silently treated as success-shaped `T`. Failures surface late as confusing property-access errors.

**Microchange direction:** Check `response.ok`; wrap with `parseJson<T>(res, schema)` using Zod/io-ts; unify in shared `httpClient.ts`.

---

### Medium

#### M-1: `clear()` does not persist or delete on-disk state
**File:** `store.ts:283-288`

```typescript
clear(): void {
  this.buckets.clear();
  this.byEventName.clear();
  this.byTokenId.clear();
  this.total = 0;
}
```

**Issue:** In-memory cleared but `events.json` remains. Next process restart **reloads stale data**, violating test/isolation expectations.

**Microchange direction:** Call `persist()` or `unlinkSync(PERSIST_FILE)` in `clear()`; document semantics.

---

#### M-2: `totalAppends` counter not reset on failed/restarted load path
**File:** `store.ts:205`, `283-288`

**Issue:** `load()` increments `this.total` but `clear()` resets to 0 without adjusting for reload. If `load()` were called again (future refactor), `total` would double-count. Currently constructor-only, but fragile invariant.

**Microchange direction:** Reset `this.total = 0` at start of `load()`; derive `totalAppends` from bucket sizes if accuracy matters.

---

#### M-3: `queryByAgent` allocates `matches` array and sorts on every query
**File:** `store.ts:115-124`

```typescript
const matches: StoredEvent[] = [];
for (const evt of bucket) { /* filter */ matches.push(evt); }
matches.sort(byBlockThenLogReceived);
return query.limit !== undefined ? matches.slice(0, query.limit) : matches;
```

**Issue:** TokenId index preserves insertion order, not block order. Every agent query pays sort cost. Could use limit-aware partial sort.

**Microchange direction:** Insert into sorted position on index build; or maintain per-tokenId sorted sub-bucket.

---

#### M-4: `persist()` serializes entire `buckets` map synchronously
**File:** `store.ts:251-260`

```typescript
writeFileSync(PERSIST_FILE, JSON.stringify(data, ...));
```

**Issue:** Blocking sync I/O on main thread; large stores stall event loop. No atomic rename.

**Microchange direction:** `writeFile` async + temp file rename; incremental persistence; or move to SQLite.

---

#### M-5: `payloadField` coerces arbitrary values via `String()`
**File:** `payloads.ts:54-61`

```typescript
return String((payload as Record<string, unknown>)[key]);
```

**Issue:** Objects become `"[object Object]"`; arrays lose structure; no validation that field is string-like.

**Microchange direction:** Return `string | undefined` only when `typeof val === 'string'` (or bigint/number with explicit formatting).

---

#### M-6: `payloadNumber` can return `NaN` silently
**File:** `payloads.ts:65-73`

```typescript
return val !== undefined && val !== null ? Number(val) : undefined;
```

**Issue:** `Number("foo")` → `NaN` returned as `number | undefined` without `Number.isFinite` check.

**Microchange direction:** Guard with `Number.isFinite(n) ? n : undefined`.

---

#### M-7: `LogEntry` index signature weakens extra-field typing
**File:** `logger.ts:13-17`

```typescript
interface LogEntry {
  level: LogLevel;
  message: string;
  component?: string;
  [key: string]: unknown;
}
```

**Issue:** Index signature makes all properties `unknown`-compatible; allows accidental typos in `level`/`message` keys when spreading `extra`.

**Microchange direction:** Separate `extra: Record<string, unknown>` field; drop index signature.

---

#### M-8: `formatLog` may throw on circular `extra` values
**File:** `logger.ts:15-16`

```typescript
.map(([k, v]) => ` ${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
```

**Issue:** `JSON.stringify` on circular structures throws; logging error could mask original error.

**Microchange direction:** Try/catch with `String(v)` fallback; use `util.inspect` with depth limit.

---

#### M-9: `run-e2e.ts` module-level side effects prevent isolated testing
**File:** `run-e2e.ts:29-79`

```typescript
loadEnv();
const DEPLOYER_PK = getEnv("DEPLOYER_PK");
// ... wallets, provider created at import time
```

**Issue:** Importing the module **requires all env vars** and creates live provider connections. Cannot unit-test helpers without full environment.

**Microchange direction:** Move initialization into `main()`; export factory functions for test reuse.

---

#### M-10: `AgentNFTMethods.iTransferFrom` uses `proofs: unknown[]`
**File:** `run-e2e.ts:82-89`

```typescript
type AgentNFTMethods = {
  iTransferFrom(..., proofs: unknown[]): Promise<TransactionResponse>;
};
```

**Issue:** Core on-chain call loses type safety for proof structs; mismatches only fail at runtime revert.

**Microchange direction:** Import proof struct types from `@axiom/config`; define `AccessOwnershipProofPair[]`.

---

#### M-11: Double assertion `as unknown as readonly string[]` for ABI
**File:** `run-e2e.ts:396-400`

```typescript
const ITRANSFER_FROM_ABI_LOCAL = [
  ...ITRANSFER_FROM_ABI,
  "event Transfer(...)",
  "function ownerOf(...)",
] as unknown as readonly string[];
```

**Issue:** Smell indicating ABI type mismatch with `TypedContract` generics; hides compile-time ABI errors.

**Microchange direction:** Extend shared ABI constant in `@axiom/config`; type `as const` fragment array properly.

---

#### M-12: Hardcoded `tokenId = "0"` in E2E flow
**File:** `run-e2e.ts:238`

```typescript
const tokenId = "0";
```

**Issue:** Entire transfer/on-chain path assumes token 0 exists and is owned by deployer. Fragile across environments.

**Microchange direction:** Derive from mint response or env `E2E_TOKEN_ID`.

---

#### M-13: Skipped E2E steps reported as `ok: true`
**File:** `run-e2e.ts:243-257`

```typescript
stepResults.push({ step: 6, name: "/v1/vaults/deposit", ok: true, summary: "skipped (wallet-owned operation)" });
```

**Issue:** Inflates pass count; `10/10 steps passed` can mask **zero coverage** of vault routes.

**Microchange direction:** Use `ok: null` / `skipped: true` status; exclude from pass denominator.

---

#### M-14: Magic chain ID `16602n` duplicated in tests
**File:** `transfer.test.ts:148-151`, `302-305`

```typescript
const testDomain: Eip712Domain = {
  chainId: 16602n,
  verifyingContract: MOCK_ADDRESSES.verifier,
};
```

**Issue:** Hardcoded Galileo chain ID; drifts if `GALILEO_CHAIN_ID` changes in config package.

**Microchange direction:** Import `GALILEO_CHAIN_ID` from `@axiom/config/networks`.

---

### Low

#### L-1: `extractErrorMessage` discards stack traces
**File:** `response.ts:3-5`

```typescript
export function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
```

**Issue:** Persist failures log message only (`store.ts:262-264`); debugging production issues harder.

**Microchange direction:** Optional `includeStack` param or log full `err` object in structured logger.

---

#### L-2: `sendError` returns minimal `{ error: message }` shape
**File:** `response.ts:7-13`

**Issue:** No error code, request ID, or field-level validation errors. Clients cannot programmatically branch.

**Microchange direction:** Extend to `{ error: { code, message, details? } }` with backward compatibility.

---

#### L-3: Logger has no level filtering / env gating
**File:** `logger.ts:20-34`

**Issue:** `debug` always routes to console; no `LOG_LEVEL` env support for production noise control.

**Microchange direction:** Compare against `process.env.LOG_LEVEL` before emit.

---

#### L-4: Singleton `EventStore` hides lifecycle management
**File:** `store.ts:314-322`

```typescript
let singleton: EventStore | undefined;
export function getEventStore(): EventStore {
  singleton ??= new EventStore();
  return singleton;
}
```

**Issue:** Global mutable state; cap/config not injectable after first call; complicates multi-tenant testing.

**Microchange direction:** DI via server bootstrap; deprecate singleton in favor of explicit instance.

---

#### L-5: `timestamp` always overwritten even if provided in input
**File:** `store.ts:88`

```typescript
stored.timestamp = Date.now();
```

**Issue:** `StoredEventInput` allows optional `timestamp` but `append` ignores caller value. Type suggests flexibility that doesn't exist.

**Microchange direction:** Use `stored.timestamp ?? Date.now()` or remove from input type.

---

#### L-6: `queryByAgent` normalizes tokenId via `BigInt` on every query
**File:** `store.ts:112`

```typescript
const target = BigInt(query.tokenId).toString();
```

**Issue:** Invalid `tokenId` strings throw uncaught `SyntaxError`. No try/catch at API boundary in this file.

**Microchange direction:** Validate in query layer; return `[]` or throw typed `InvalidTokenIdError`.

---

#### L-7: `transfer.test.ts` inconsistent `accessProofNonce` JSON types
**File:** `transfer.test.ts:105` vs `264`

```typescript
accessProofNonce: "1",   // string in first test
accessProofNonce: 7,     // number in re-key test
```

**Issue:** Tests don't enforce canonical API contract for nonce type; may mask coercion bugs.

**Microchange direction:** Standardize on one type matching OpenAPI/schema; add negative test for wrong type.

---

#### L-8: Third integration test duplicates server bootstrap logic
**File:** `transfer.test.ts:218-368`

**Issue:** Inline oracle+backend setup mirrors `before()` hook (~80 lines). Maintenance burden when `startBackendServer` API changes.

**Microchange direction:** Extract `withTestServers(fn)` helper shared across tests.

---

#### L-9: `run-e2e.ts` `postStep` logs full JSON response (potential secret leak)
**File:** `run-e2e.ts:139`

```typescript
console.log(`          ${JSON.stringify(res)}`);
```

**Issue:** May log `sealedKey`, signatures, or internal fields to CI logs.

**Microchange direction:** Redact sensitive keys in log serializer.

---

#### L-10: `MAX_AGENT_ENUMERATION` constant unused in scoped files
**File:** `constants.ts:6`

**Issue:** Constant defined but not referenced within partition; coupling unclear from these files alone.

**Microchange direction:** (Out of scope to relocate) Ensure single source of truth where enumeration occurs.

---

#### L-11: `DEFAULT_EVENT_LIMIT` unused in scoped files
**File:** `constants.ts:12`

**Issue:** Store `getAll`/`queryByAgent` accept `limit` but don't default to this constant.

**Microchange direction:** Apply `DEFAULT_EVENT_LIMIT` as default param in query methods.

---

### Cosmetic

#### CO-1: Comment on `main()` line count is stale
**File:** `run-e2e.ts:101`

```typescript
// FLAG: main() is 263 lines — exceeds 100-line threshold.
```

**Issue:** Function now ~413 lines; comment misleads reviewers.

**Microchange direction:** Update count or remove after refactor.

---

#### CO-2: Inconsistent naming `receiverPubKey64` vs `receiverPubkey64`
**File:** `run-e2e.ts:74` vs `transfer.test.ts:45`

**Issue:** Same concept, different casing (`Key` vs `key`). Cross-file friction only.

**Microchange direction:** Align on one spelling in API contract.

---

#### CO-3: `MW14` version string in CLI banner may be outdated
**File:** `run-e2e.ts:105`

```typescript
console.log("  Axiom Protocol — E2E CLI (MW14)");
```

**Microchange direction:** Drive from package version or remove milestone tag.

---

#### CO-4: `payloads.ts` header claims elimination of casts — not fully realized
**File:** `payloads.ts:1`

```typescript
/** Typed event payload interfaces. Eliminates `as Record<string, unknown>` casts. */
```

**Issue:** Aspirational; `store.ts` still uses `Record<string, unknown>`.

**Microchange direction:** Soften comment to "intended to reduce casts" or complete integration.

---

#### CO-5: `byBlockThenLogReceived` comparator name vs `timestamp` cursor field
**File:** `store.ts:44-47`, `126-146`

**Issue:** `getAll(since)` filters on `timestamp` but sorts by `receivedAt` as tertiary key — naming may confuse readers about cursor semantics.

**Microchange direction:** Document that `since` is store-append cursor, not chain time.

---

## 4. Type Safety Audit

### Summary Table

| Location | Pattern | Risk | Severity |
|----------|---------|------|----------|
| `store.ts:80` | `structuredClone(evt) as StoredEvent` | Missing fields silently allowed post-clone | Medium |
| `store.ts:199` | `JSON.parse(raw) as Record<...>` | Invalid disk data treated as typed | High |
| `store.ts:24` | `payload: Record<string, unknown>` | No event-kind narrowing | High |
| `payloads.ts:51` | `\| Record<string, unknown>` in union | Exhaustiveness broken | High |
| `payloads.ts:59,70` | `(payload as Record<string, unknown>)` | Boundary cast, acceptable if centralized | Low |
| `run-e2e.ts:87` | `proofs: unknown[]` | On-chain args untyped | Medium |
| `run-e2e.ts:137,151,226` | `as T` on fetch JSON | No runtime validation | High |
| `run-e2e.ts:400` | `as unknown as readonly string[]` | ABI type bypass | Medium |
| `run-e2e.ts:455` | `parsed.args as unknown as [string,string,bigint]` | Event decode untyped | Medium |
| `transfer.test.ts` | Multiple inline response `as { ... }` | Test-only but encodes no contract | Medium |
| `logger.ts:7` | `[key: string]: unknown` | Loose log metadata | Medium |
| `response.ts:3` | `err: unknown` | ✅ Correct | — |

### `any` Usage
**None found** in scoped files.

### Discriminated Union Opportunities
- `StoredEvent.eventName` + `payloads.ts` interfaces → `StoredEvent<'Transfer', TransferPayload>` pattern not used.
- `run-e2e.ts` `ChallengeResponse | FinalResponse` distinguished by `stage` but handled as separate `postStep` calls — could be unified union with narrowing.

### Untyped Data Flow
```
Chain/Indexer → append(StoredEventInput) → structuredClone → Map buckets
                    ↓
              JSON disk round-trip (unvalidated)
                    ↓
              query* → readonly arrays (mutable leak)
                    ↓
              consumers cast payload fields manually
```

`payloads.ts` helpers (`payloadField`, `payloadNumber`) are the intended extraction layer but **are not referenced** in `store.ts` within this partition.

---

## 5. Performance & Memory Audit

### Hot-Path Anti-Patterns

| Pattern | Location | Impact |
|---------|----------|--------|
| `structuredClone` per append | `store.ts:80` | O(payload size) alloc every event |
| `all.push(...bucket)` spread | `store.ts:139` | O(N) copy per unscoped getAll |
| `matches.sort()` per agent query | `store.ts:123` | O(k log k) per query |
| `indexOf` + `splice` on eviction | `store.ts:238-246` | O(n) per index per eviction |
| Full scan `getTokenIdsByOwner` | `store.ts:158-169` | O(all events) |
| Sync `writeFileSync` + full JSON | `store.ts:255-260` | Blocks event loop |
| `JSON.stringify` entire store | `store.ts:257` | O(N) serialize every persist |

### Zero-Copy Opportunities

1. **Index arrays hold references to same `StoredEvent` objects** (`store.ts:93-96`) — good: single object identity across indexes.
2. **`queryBySource` returns bucket directly** — zero-copy but unsafe (see C-2); trade safety for copy.
3. **`readFileSync` + `JSON.parse`** — full deserialize on startup; unavoidable for JSON persistence but could mmap or stream for large files.
4. **E2E `blob` construction** (`run-e2e.ts:179-184`) — manual `Uint8Array` assembly is appropriate; no extra copy needed.
5. **`concatEncrypted` used in tests** (`transfer.test.ts:228`) vs manual concat in E2E — E2E could reuse shared helper (duplication note, not in scope to fix).

### Memory Retention
- Three `Map<string, StoredEvent[]>` indexes duplicate **pointers** not objects — acceptable.
- Eviction cap per `(source, eventName)` bucket only; `byEventName` / `byTokenId` grow unbounded with distinct keys unless eviction cleans indexes (it does via `removeFromIndex`).
- Debounce timer holds closure over `this` — negligible.

---

## 6. Architecture Assessment

### `EventStore` — Moderate God-Class Tendency

**Responsibilities bundled:**
- CRUD (append, query variants, clear)
- Three secondary indexes (eventName, tokenId, source::eventName buckets)
- FIFO eviction policy
- Disk persistence (load, debounced save, flush)
- Domain logic (`getTokenIdsByOwner`, `tokenIdFromPayload`)
- Singleton lifecycle

**Separation-of-concerns score:** 4/10 — persistence, indexing, and query logic should split into `EventIndex`, `EventPersistence`, `EventStore` facade.

**Index consistency model:** Manual dual-index maintenance on append/evict. Correct by construction if no external mutation (violated by C-2). No invariant checks in dev.

### `payloads.ts` — Orphan Type Module

Well-structured per-event interfaces but **not wired** into store or (within partition) consumed elsewhere. Architecture intent appears ahead of implementation.

### Utilities Layer — Appropriate Thin Wrappers

`logger.ts`, `response.ts`, `constants.ts` are small, focused modules. No god-class issues. Logger could grow into observability adapter later.

### `run-e2e.ts` — Script-as-Monolith

Violates single-responsibility at file level: CLI UX, crypto orchestration, HTTP client, on-chain executor. `postStep<T>` is a good local abstraction but insufficient at macro scale.

### `transfer.test.ts` — Solid Integration Architecture

- Real HTTP servers on ephemeral ports ✅
- Oracle + backend coupling tested end-to-end ✅
- Isolated re-key test with own servers ✅
- Weakness: response typing inline, setup duplication

### Dependency Graph (within partition)

```
run-e2e.ts ──→ constants.ts (TRANSFER_TOPIC)
            ──→ (no logger/response/store/payloads)

store.ts ──→ logger.ts
         ──→ response.ts (extractErrorMessage)

transfer.test.ts ──→ server.js (out of partition)

payloads.ts ──→ (standalone)

constants.ts, logger.ts, response.ts ──→ (standalone)
```

**Observation:** `payloads.ts` is architecturally isolated from `store.ts` despite semantic overlap — key structural gap.

---

## 7. Positive Findings

1. **Constructor validation** for `maxEventsPerSource` (`store.ts:62-66`) — fail-fast on invalid cap.
2. **Multi-index design** with FIFO per-source eviction — thoughtful for agent event polling patterns.
3. **Debounced persistence** (`store.ts:268-271`) — reduces disk churn under burst appends.
4. **`flush()` for graceful shutdown** (`store.ts:274-281`) — correct primitive provided (needs wiring).
5. **`tokenIdFromPayload` defensive parsing** (`store.ts:295-310`) — handles bigint, number, string, empty.
6. **`extractErrorMessage(err: unknown)`** (`response.ts:3-5`) — proper unknown handling.
7. **Typed payload interfaces** (`payloads.ts:3-42`) — clear domain vocabulary per event type.
8. **`as const` constants** (`constants.ts`) — immutable literal types.
9. **Component-scoped logger factory** (`logger.ts:20-34`) — consistent log format with context.
10. **Static imports in E2E** (`run-e2e.ts:26-27`) — adheres to `ts-no-dynamic-import` rule.
11. **`postStep<T>` abstraction** (`run-e2e.ts:125-148`) — DRY for HTTP steps with typed summaries.
12. **Transfer tests cover challenge, final, and re-key paths** (`transfer.test.ts`) — high-value integration coverage.
13. **Test server lifecycle** with `waitForListening` / `waitForClose` (`transfer.test.ts:24-37`) — clean async patterns.
14. **_re-setEventStoreForTests** (`store.ts:320-322`) — acknowledges testability for singleton.
15. **Documented opacity of payload in store** (`store.ts:15-16`) — honest API contract.

---

## 8. Microchange Opportunities (Prioritized)

### P0 — Production Safety (Critical/High)

| # | Change | Files | Effort |
|---|--------|-------|--------|
| 1 | Log + quarantine corrupt persist file; atomic write | `store.ts` | S |
| 2 | Defensive copy or freeze on query returns | `store.ts` | S |
| 3 | Wire `flush()` to process shutdown hooks | `store.ts` + server bootstrap | S |
| 4 | Runtime schema validation on `load()` | `store.ts` | M |
| 5 | HTTP helper: check status + validate JSON | `run-e2e.ts`, new util | M |

### P1 — Type System Integrity (High/Medium)

| # | Change | Files | Effort |
|---|--------|-------|--------|
| 6 | Connect `EventPayload` to `StoredEvent` via discriminant | `store.ts`, `payloads.ts` | L |
| 7 | Remove `Record<string, unknown>` from `EventPayload` union | `payloads.ts` | S |
| 8 | Type `iTransferFrom` proofs array | `run-e2e.ts` | S |
| 9 | Import `GALILEO_CHAIN_ID` in tests | `transfer.test.ts` | S |
| 10 | Fix `payloadNumber` NaN guard | `payloads.ts` | S |

### P2 — Performance (High/Medium)

| # | Change | Files | Effort |
|---|--------|-------|--------|
| 11 | O(1) index removal or lazy rebuild | `store.ts` | M |
| 12 | Avoid full `getAll` materialization — iterator/merge | `store.ts` | M |
| 13 | Owner index for `getTokenIdsByOwner` | `store.ts` | M |
| 14 | Revisit `structuredClone` necessity | `store.ts` | S |
| 15 | Async persist with temp-rename | `store.ts` | M |

### P3 — Architecture & Maintainability (Medium/Low)

| # | Change | Files | Effort |
|---|--------|-------|--------|
| 16 | Extract E2E step modules from `main()` | `run-e2e.ts` | L |
| 17 | Split `EventStore` into index + persist | `store.ts` | L |
| 18 | `clear()` syncs disk state | `store.ts` | S |
| 19 | Extract `withTestServers` test helper | `transfer.test.ts` | M |
| 20 | Skip vs pass semantics in E2E summary | `run-e2e.ts` | S |
| 21 | `LOG_LEVEL` gating in logger | `logger.ts` | S |
| 22 | Apply `DEFAULT_EVENT_LIMIT` defaults | `store.ts`, `constants.ts` | S |

### P4 — Cosmetic

| # | Change | Files | Effort |
|---|--------|-------|--------|
| 23 | Update stale `main()` line-count comment | `run-e2e.ts` | S |
| 24 | Align `receiverPubKey64` naming | cross-file | S |
| 25 | Soften `payloads.ts` header comment | `payloads.ts` | S |

**Effort key:** S = small (<1h), M = medium (half-day), L = large (1+ days)

---

## Appendix: File-Level Issue Counts

| File | Critical | High | Medium | Low | Cosmetic | Total |
|------|----------|------|--------|-----|----------|-------|
| `store.ts` | 3 | 5 | 4 | 4 | 1 | 17 |
| `payloads.ts` | 0 | 2 | 2 | 0 | 1 | 5 |
| `logger.ts` | 0 | 0 | 2 | 1 | 0 | 3 |
| `constants.ts` | 0 | 0 | 0 | 2 | 0 | 2 |
| `response.ts` | 0 | 0 | 0 | 2 | 0 | 2 |
| `run-e2e.ts` | 0 | 2 | 5 | 2 | 2 | 11 |
| `transfer.test.ts` | 0 | 0 | 1 | 2 | 1 | 4 |
| **Total** | **3** | **9** | **14** | **11** | **5** | **42** |

---

*End of report. No code changes were implemented per agent mandate.*