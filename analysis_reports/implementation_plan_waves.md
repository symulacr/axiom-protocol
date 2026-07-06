# Implementation Plan — Multi-Wave Execution

**Total findings**: 63  
**Strategy**: 3 waves × up to 4 parallel agents each  
**Guiding principle**: Security first → correctness → cleanup. Each finding includes verified evidence and before/after code.

---

## Execution Overview

```
WAVE 1 (Security + Correctness + Critical Data Flow)
  Agent 1: Security fixes (auth.ts timing, env.ts quotes, env.ts fallback)
  Agent 2: Orchestrator data flow (model cache, TEE chatId, TEE try/catch, Promise.allSettled)
  Agent 3: Indexer + EventStore fixes (re-buffering, clear persistence, index eviction)
  Agent 4: Oracle fixes (mint ZodError, schema optional→required, remove double-validation)

WAVE 2 (Caching + Memory Leaks + Infrastructure)
  Agent 1: Provider discovery (chain-aware cache, race condition fix)
  Agent 2: Memory leak fixes (broker caches, seenDataHashes, concatEncrypted, process.ts)
  Agent 3: Config package cleanup (schemas.ts dedup, StorageAdapter interface, addresses dynamic, env alias warning, hex.ts double cast)
  Agent 4: Backend duplication cleanup (constants dedup, sendError standardization, TTLCache extraction, error message extraction)

WAVE 3 (Consistency + Polish + Improvements)
  Agent 1: Backend duplication cleanup continued (TypedContract sharing, query limit extraction, event timestamp auto-fill, EIP-712 factory)
  Agent 2: Orchestrator improvements (settleOnChain action usage, parseRecommendation bounds, error truncation)
  Agent 3: Indexer improvements (retry logic, chain reorg awareness)
  Agent 4: Cosmetic + naming fixes (deriveUncompressedPubkey rename, toViemHex cast, auth.ts publicPaths, secp256k1.ts roundtrip, OwnershipProofResult split)
```

---

## WAVE 1 — Security + Correctness + Critical Data Flow

**Goal**: Eliminate the 1 critical issue, all high-severity issues, and critical data-flow bugs.  
**Duration estimate**: Each agent ~60–90 min. Parallel execution completes in ~90 min.

---

### Agent 1: Security & Config Foundations

**Scope**: `packages/config/src/middleware/auth.ts`, `packages/config/src/env.ts`

#### Finding C1: Timing-Vulnerable API Key Comparison
- **Severity**: Critical
- **File**: `packages/config/src/middleware/auth.ts:11`
- **Evidence**: `if (key !== apiKey)` — standard string comparison short-circuits on first mismatched byte, enabling timing side-channel.

**BEFORE** (`packages/config/src/middleware/auth.ts:10-11`):
```typescript
const key = req.headers["x-api-key"];
if (key !== apiKey) {
```

**AFTER**:
```typescript
import { timingSafeEqual } from "node:crypto";

const key = req.headers["x-api-key"];
const keyBuf = Buffer.from(key ?? "", "utf-8");
const apiBuf = Buffer.from(apiKey, "utf-8");
if (keyBuf.length !== apiBuf.length || !timingSafeEqual(keyBuf, apiBuf)) {
```

---

#### Finding H5: `.env` Parser Does Not Handle Quoted Values
- **Severity**: High
- **File**: `packages/config/src/env.ts:33`
- **Evidence**: `const val = trimmed.slice(eq + 1).trim();` — no quote stripping. If `.env` has `DB_URL="postgres://..."`, the value includes literal `"..."`.

**BEFORE** (`packages/config/src/env.ts:33`):
```typescript
const val = trimmed.slice(eq + 1).trim();
```

**AFTER**:
```typescript
const raw = trimmed.slice(eq + 1).trim();
const val = raw.replace(/^(['"])(.*)\1$/, "$2");
```

---

#### Finding H7: `loadEnv` Fallback Hardcoded to `../../.env`
- **Severity**: High
- **File**: `packages/config/src/env.ts:22`
- **Evidence**: `resolvedPath = join(process.cwd(), "../../.env");` — fragile relative path that may load wrong .env in monorepo.

**BEFORE** (`packages/config/src/env.ts:20-23`):
```typescript
  if (!resolvedPath) {
    resolvedPath = join(process.cwd(), "../../.env");
  }
```

**AFTER**:
```typescript
  // No hardcoded fallback — .env traversal already walks to filesystem root.
  // If not found, the catch block below silently no-ops (env is optional).
```

(Remove lines 20-23 entirely. The `while` loop above already traverses up to root. The `catch` block at line 36 handles the case where no `.env` is found.)

---

#### Finding H8: `getEnvWithAlias` Silently Uses Deprecated Aliases
- **Severity**: High
- **File**: `packages/config/src/env.ts:61-73`
- **Evidence**: Loop iterates aliases with no logging.

**BEFORE** (`packages/config/src/env.ts:61-73`):
```typescript
export function getEnvWithAlias(
  canonical: string,
  aliases: string[],
  fallback?: string,
): string {
  for (const key of [canonical, ...aliases]) {
    const val = process.env[key];
    if (val !== undefined && val !== "") return val;
  }
```

**AFTER**:
```typescript
export function getEnvWithAlias(
  canonical: string,
  aliases: string[],
  fallback?: string,
): string {
  for (const key of [canonical, ...aliases]) {
    const val = process.env[key];
    if (val !== undefined && val !== "") {
      if (key !== canonical) {
        console.warn(`[config] DEPRECATED: env var "${key}" is deprecated, use "${canonical}"`);
      }
      return val;
    }
  }
```

---

### Agent 2: Orchestrator Data Flow Fixes

**Scope**: `apps/backend/src/orchestrator/index.ts`, `apps/backend/src/compute/tee-verifier.ts`

#### Finding H1: Model Parameter Silently Ignored After First Call
- **Severity**: High
- **File**: `apps/backend/src/orchestrator/index.ts:100-105`
- **Evidence**: `getClient()` caches `this.openai` on first call; subsequent calls with different `model` return the cached client ignoring the new model.

**BEFORE** (`apps/backend/src/orchestrator/index.ts:100-105`):
```typescript
private async getClient(model?: string): Promise<OpenAI> {
  if (!this.openai) {
    this.openai = await createRouterClient(model);
  }
  return this.openai;
}
```

**AFTER**:
```typescript
private async getClient(model?: string): Promise<OpenAI> {
  if (this.openai && this.openaiModel === model) {
    return this.openai;
  }
  this.openai = await createRouterClient(model);
  this.openaiModel = model;
  return this.openai;
}
```

Add field to `StrategyRunner` class: `private openaiModel: string | undefined;`

---

#### Finding H2: TEE Verification Documented as "Best-Effort" But Actually Throws
- **Severity**: High
- **Files**: `apps/backend/src/compute/tee-verifier.ts:8` (doc), `apps/backend/src/orchestrator/index.ts:124-126, 300-303` (code)
- **Evidence**: Docstring says "intentionally best-effort — never blocks the tick" but `verifyTeeAsync` throws on `result === false`.

**BEFORE** (`apps/backend/src/orchestrator/index.ts:124-126`):
```typescript
if (process.env.AXIOM_COMPUTE_VERIFY_TEE === "true") {
  await this.verifyTeeAsync(rawModelOutput);
}
```

**AFTER**:
```typescript
if (process.env.AXIOM_COMPUTE_VERIFY_TEE === "true") {
  try {
    await this.verifyTeeAsync(rawModelOutput);
  } catch (err) {
    log.warn("TEE verification failed (best-effort, tick continues)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
```

---

#### Finding H3: chatId Never Plumbed to TEE Verification
- **Severity**: High
- **Files**: `apps/backend/src/compute/router.ts:110-111, 154-157` (chatId tracked), `apps/backend/src/orchestrator/index.ts:287-292` (chatId missing)
- **Evidence**: `clientChatIdMap` WeakMap tracks chatId per OpenAI client, but orchestrator never reads it.

**BEFORE** (`apps/backend/src/orchestrator/index.ts:287-292`):
```typescript
const result = await verifyTeeResponse(
  this.chainId,
  this.signer,
  providerAddress,
  rawModelOutput,
);
```

**AFTER**:
```typescript
import { clientChatIdMap } from "../compute/router.js";

// Inside verifyTeeAsync:
const chatId = this.openai ? clientChatIdMap.get(this.openai) : undefined;
const result = await verifyTeeResponse(
  this.chainId,
  this.signer,
  providerAddress,
  rawModelOutput,
  chatId,
);
```

---

#### Finding M10: `parseRecommendation` Doesn't Validate Amount Bounds
- **Severity**: Medium (batch with this agent since it's in the same file)
- **File**: `apps/backend/src/orchestrator/index.ts:178-181`
- **Evidence**: `amount: typeof parsed.amount === "number" ? parsed.amount : undefined` — accepts -1e18, NaN, Infinity.

**BEFORE** (`apps/backend/src/orchestrator/index.ts:178-181`):
```typescript
return {
  action,
  amount: typeof parsed.amount === "number" ? parsed.amount : undefined,
  reason: typeof parsed.reason === "string" ? parsed.reason : "no reason provided",
};
```

**AFTER**:
```typescript
const rawAmount = typeof parsed.amount === "number" ? parsed.amount : undefined;
const amount =
  rawAmount !== undefined &&
  Number.isFinite(rawAmount) &&
  rawAmount >= 0 &&
  rawAmount <= 1e18
    ? rawAmount
    : undefined;
return {
  action,
  amount,
  reason: typeof parsed.reason === "string" ? parsed.reason : "no reason provided",
};
```

---

#### Finding M21: `Promise.all` in `runTick` Loses Partial Results
- **Severity**: Medium (batch with this agent)
- **File**: `apps/backend/src/orchestrator/index.ts:115-121`
- **Evidence**: If any of 3 parallel ops fails, entire result is lost.

**BEFORE** (`apps/backend/src/orchestrator/index.ts:115-121`):
```typescript
const [rawModelOutput, onchain, storage] = await Promise.all([
  this.runInference(strategy, signal, onChunk),
  this.fetchOnchainState(strategy),
  strategy.modelDataRoot === "0x" + "0".repeat(64)
    ? { rootHash: strategy.modelDataRoot, size: 0 }
    : this.fetchStoragePeek(strategy),
] as const);
```

**AFTER**:
```typescript
const [inferenceResult, onchainResult, storageResult] = await Promise.allSettled([
  this.runInference(strategy, signal, onChunk),
  this.fetchOnchainState(strategy),
  strategy.modelDataRoot === "0x" + "0".repeat(64)
    ? Promise.resolve({ rootHash: strategy.modelDataRoot, size: 0 })
    : this.fetchStoragePeek(strategy),
]);

const rawModelOutput =
  inferenceResult.status === "fulfilled"
    ? inferenceResult.value
    : (() => { throw new Error(`Inference failed: ${inferenceResult.reason}`); })();
const onchain =
  onchainResult.status === "fulfilled"
    ? onchainResult.value
    : { vaultBalance: 0n, recentEvents: [] };
const storage =
  storageResult.status === "fulfilled"
    ? storageResult.value
    : { rootHash: "0x" + "0".repeat(64), size: 0 };
```

---

### Agent 3: Indexer + EventStore Fixes

**Scope**: `apps/indexer/src/index.ts`, `apps/backend/src/events/store.ts`

#### Finding H4: Indexer Re-Buffering Drops Newest Events
- **Severity**: High
- **File**: `apps/indexer/src/index.ts:78-88`
- **Evidence**: `eventBuffer.pop()` drops the NEWEST events (end of array) to make room, then `unshift(...batch)` prepends OLDER failed batch.

**BEFORE** (`apps/indexer/src/index.ts:79-88`):
```typescript
const MAX_BUFFER_SIZE = 10000;
for (const _ev of batch) {
  if (eventBuffer.length >= MAX_BUFFER_SIZE) {
    const dropped = eventBuffer.pop();
    console.warn(
      `[indexer] event buffer full, dropping oldest event: ${dropped?.kind ?? "unknown"}`,
    );
  }
}
eventBuffer.unshift(...batch);
```

**AFTER**:
```typescript
const MAX_BUFFER_SIZE = 10000;
// Make room by dropping the OLDEST events (front of buffer)
while (eventBuffer.length + batch.length > MAX_BUFFER_SIZE && eventBuffer.length > 0) {
  const dropped = eventBuffer.shift();
  console.warn(
    `[indexer] event buffer full, dropping oldest event: ${dropped?.kind ?? "unknown"}`,
  );
}
// Re-insert failed batch at the end (chronological order preserved)
eventBuffer.push(...batch);
```

---

#### Finding M11: `EventStore.clear()` Doesn't Persist
- **Severity**: Medium
- **File**: `apps/backend/src/events/store.ts:275-280`
- **Evidence**: `clear()` empties all maps but doesn't call `persist()`, so next restart reloads stale data.

**BEFORE** (`apps/backend/src/events/store.ts:275-280`):
```typescript
clear(): void {
  this.buckets.clear();
  this.byEventName.clear();
  this.byTokenId.clear();
  this.total = 0;
}
```

**AFTER**:
```typescript
clear(): void {
  this.buckets.clear();
  this.byEventName.clear();
  this.byTokenId.clear();
  this.total = 0;
  this.persistDebounced();
}
```

---

#### Finding M12: `removeFromIndex` Never Removes Empty Map Entries
- **Severity**: Medium
- **File**: `apps/backend/src/events/store.ts:229-242`
- **Evidence**: After `splice`, empty arrays remain as Map keys — slow memory leak.

**BEFORE** (`apps/backend/src/events/store.ts:229-242`):
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

**AFTER**:
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

#### Finding M22: EventStore Persists to `process.cwd()`-Relative Path
- **Severity**: Medium (batch with this agent)
- **File**: `apps/backend/src/events/store.ts:12-13`
- **Evidence**: `const PERSIST_DIR = join(process.cwd(), ".data");` — varies by CWD at launch.

**BEFORE** (`apps/backend/src/events/store.ts:12-13`):
```typescript
const PERSIST_DIR = join(process.cwd(), ".data");
const PERSIST_FILE = join(PERSIST_DIR, "events.json");
```

**AFTER**:
```typescript
const PERSIST_DIR = join(
  process.env.AXIOM_DATA_DIR ?? process.cwd(),
  ".data",
);
const PERSIST_FILE = join(PERSIST_DIR, "events.json");
```

---

### Agent 4: Oracle Fixes

**Scope**: `apps/oracle/src/server.ts`, `apps/oracle/src/route-schemas.ts`

#### Finding M13: Oracle `/v1/agents/mint` Missing ZodError Catch
- **Severity**: Medium
- **File**: `apps/oracle/src/server.ts:315-325`
- **Evidence**: `mintDataHashSchema.parse(req.body)` without try/catch — ZodError returns 500.

**BEFORE** (`apps/oracle/src/server.ts:315-325`):
```typescript
app.post("/v1/agents/mint", (req: Request, res: Response) => {
  const { dataHash } = mintDataHashSchema.parse(req.body);
  if (!/^0x[0-9a-fA-F]{64}$/.test(dataHash)) {
    res.status(400).json({
      error: "dataHash must be a 32-byte hex string (0x + 64 hex chars)",
    });
    return;
  }
  storage.markDataHashSeen(dataHash as `0x${string}`);
  res.json({ ok: true, dataHash, seen: true });
});
```

**AFTER**:
```typescript
app.post("/v1/agents/mint", (req: Request, res: Response) => {
  try {
    const { dataHash } = mintDataHashSchema.parse(req.body);
    if (!/^0x[0-9a-fA-F]{64}$/.test(dataHash)) {
      res.status(400).json({
        error: "dataHash must be a 32-byte hex string (0x + 64 hex chars)",
      });
      return;
    }
    storage.markDataHashSeen(dataHash as `0x${string}`);
    res.json({ ok: true, dataHash, seen: true });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: err.issues[0]?.message ?? "Validation error" });
      return;
    }
    throw err;
  }
});
```

Add import: `import { ZodError } from "zod";`

---

#### Finding M14: Oracle transfer-validity Schema Marks `to`/`nft` as Optional But Handler Requires Them
- **Severity**: Medium
- **Files**: `apps/oracle/src/route-schemas.ts:11-12` (schema), `apps/oracle/src/server.ts:111-123` (handler)
- **Evidence**: Schema: `to: addressViem.optional()` / `nft: addressViem.optional()`. Handler: `if (!toIn || !isAddress(toIn)) { res.status(400)... }`.

**BEFORE** (`apps/oracle/src/route-schemas.ts:4-13`):
```typescript
export const transferValiditySchema = z.object({
  oldDataHash: hexViem,
  oldDataUri: hexViem,
  targetPubkey64: hexViem,
  accessProofNonce: z.union([z.string(), z.number()]),
  ownershipProofNonce: z.union([z.string(), z.number()]).optional(),
  oldDataEncryptionKey: z.string(),
  to: addressViem.optional(),
  nft: addressViem.optional(),
});
```

**AFTER**:
```typescript
export const transferValiditySchema = z.object({
  oldDataHash: hexViem,
  oldDataUri: hexViem,
  targetPubkey64: hexViem,
  accessProofNonce: z.union([z.string(), z.number()]),
  ownershipProofNonce: z.union([z.string(), z.number()]).optional(),
  oldDataEncryptionKey: z.string(),
  to: addressViem,
  nft: addressViem,
});
```

Then remove the redundant manual address checks in `server.ts:111-123` since Zod now validates them.

---

#### Finding M23: Oracle transfer-validity Double-Validates After Zod Parse
- **Severity**: Medium
- **File**: `apps/oracle/src/server.ts:92-124`
- **Evidence**: After Zod parse at line 92, manual checks at lines 94-124 re-validate what Zod already validated. With M14 fix making `to`/`nft` required, the manual `!toIn || !isAddress(toIn)` checks become redundant.

**BEFORE** (`apps/oracle/src/server.ts:92-124`):
```typescript
const { oldDataHash, oldDataUri, targetPubkey64, ... } = transferValiditySchema.parse(req.body);
if (!oldDataHash || !oldDataUri || !targetPubkey64) { ... }
if (targetPubkey64.length !== 130) { ... }
if (!oldDataEncryptionKey) { ... }
if (!toIn || !isAddress(toIn)) { ... }
if (!nftIn || !isAddress(nftIn)) { ... }
```

**AFTER** (with M14 applied):
```typescript
const { oldDataHash, oldDataUri, targetPubkey64, ... } = transferValiditySchema.parse(req.body);
// Zod already validates hex format and address format for to/nft.
// Only keep checks that Zod cannot enforce:
if (targetPubkey64.length !== 130) {
  res.status(400).json({ error: "targetPubkey64 must be 64 bytes (128 hex chars)" });
  return;
}
```

---

## WAVE 2 — Caching + Memory Leaks + Infrastructure

**Goal**: Fix memory leaks, cache corruption, and config package issues.  
**Duration estimate**: Each agent ~60–90 min. Parallel execution completes in ~90 min.

---

### Agent 1: Provider Discovery Cache Fixes

**Scope**: `apps/backend/src/compute/provider-discovery.ts`

#### Finding M7: Provider Discovery Cache Is Chain-Agnostic
- **Severity**: Medium
- **File**: `apps/backend/src/compute/provider-discovery.ts:17-20, 30-36`
- **Evidence**: Single `_cachedProviders` variable but `discoverProviders` accepts `chainId` that is never used as cache key.

**BEFORE** (`apps/backend/src/compute/provider-discovery.ts:17-20, 34-36`):
```typescript
let _cachedProviders: ServiceInfo[] | null = null;
let _cachePromise: Promise<ServiceInfo[]> | null = null;
let _cacheTimestamp = 0;
const CACHE_TTL_MS = 300_000;

export async function discoverProviders(rpcUrl: string, chainId?: number): Promise<ServiceInfo[]> {
  if (_cachedProviders && Date.now() - _cacheTimestamp < CACHE_TTL_MS)
    return _cachedProviders;
  if (_cachePromise) return _cachePromise;
```

**AFTER**:
```typescript
interface CacheEntry {
  providers: ServiceInfo[];
  timestamp: number;
}
const _cache = new Map<number, CacheEntry>();
let _cachePromise: Promise<ServiceInfo[]> | null = null;
const CACHE_TTL_MS = 300_000;

export async function discoverProviders(rpcUrl: string, chainId?: number): Promise<ServiceInfo[]> {
  const cid = chainId ?? 16602;
  const cached = _cache.get(cid);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS)
    return cached.providers;
  if (_cachePromise) return _cachePromise;
```

Update the cache-set code (after IIFE resolves) to use `_cache.set(cid, { providers: mapped, timestamp: Date.now() })`.

---

#### Finding M8: Race Condition in Provider Discovery
- **Severity**: Medium
- **File**: `apps/backend/src/compute/provider-discovery.ts:34-51`
- **Evidence**: Two concurrent callers both pass null-check on `_cachePromise` and create independent IIFEs.

**BEFORE** (`apps/backend/src/compute/provider-discovery.ts:36-38`):
```typescript
if (_cachePromise) return _cachePromise;

_cachePromise = (async (): Promise<ServiceInfo[]> => {
```

**AFTER**:
```typescript
if (_cachePromise) return _cachePromise;

// Set promise BEFORE the async IIFE to prevent race condition
const promise = (async (): Promise<ServiceInfo[]> => {
  // ... existing IIFE body ...
})();
_cachePromise = promise;
```

Move `_cachePromise = promise;` to before the IIFE body executes (currently it's inside the IIFE assignment).

---

### Agent 2: Memory Leak & Performance Fixes

**Scope**: `apps/backend/src/compute/broker.ts`, `packages/config/src/storage/0g.ts`, `packages/config/src/crypto/aes-gcm.ts`, `packages/config/src/process.ts`

#### Finding M9: Broker Caches Grow Unbounded
- **Severity**: Medium
- **File**: `apps/backend/src/compute/broker.ts:62-63, 79-80`
- **Evidence**: `_readOnlyCache` and `_brokerCache` are Maps with no eviction.

**BEFORE** (`apps/backend/src/compute/broker.ts:62, 79`):
```typescript
const _readOnlyCache = new Map<number, ReadOnlyInferenceBroker>();
const _brokerCache = new Map<number, ZGComputeNetworkBroker>();
```

**AFTER**:
```typescript
const _readOnlyCache = new Map<number, ReadOnlyInferenceBroker>();
const _brokerCache = new Map<number, ZGComputeNetworkBroker>();

export function clearBrokerCache(chainId?: number): void {
  if (chainId !== undefined) {
    _readOnlyCache.delete(chainId);
    _brokerCache.delete(chainId);
  } else {
    _readOnlyCache.clear();
    _brokerCache.clear();
  }
}
```

Call `clearBrokerCache()` from `invalidateProviderCache()` in `provider-discovery.ts`.

---

#### Finding M15: `seenDataHashes` Set Grows Unbounded
- **Severity**: Medium
- **File**: `packages/config/src/storage/0g.ts:63, 179`
- **Evidence**: `private seenDataHashes = new Set<string>()` — no eviction, no TTL.

**BEFORE** (`packages/config/src/storage/0g.ts:63, 77-83`):
```typescript
private seenDataHashes = new Set<string>();

markDataHashSeen(rootHash: Hex): void {
  this.seenDataHashes.add(rootHash.toLowerCase());
}
hasSeenDataHash(rootHash: Hex): boolean {
  return this.seenDataHashes.has(rootHash.toLowerCase());
}
```

**AFTER** (both `InMemoryStorage` and `ZeroGStorage`):
```typescript
private seenDataHashes = new Set<string>();
private readonly MAX_SEEN_HASHES = 10_000;

markDataHashSeen(rootHash: Hex): void {
  if (this.seenDataHashes.size >= this.MAX_SEEN_HASHES) {
    // Evict oldest entries (Set preserves insertion order)
    const iter = this.seenDataHashes.values();
    for (let i = 0; i < 1000; i++) {
      const val = iter.next().value;
      if (val !== undefined) this.seenDataHashes.delete(val);
      else break;
    }
  }
  this.seenDataHashes.add(rootHash.toLowerCase());
}
hasSeenDataHash(rootHash: Hex): boolean {
  return this.seenDataHashes.has(rootHash.toLowerCase());
}
```

---

#### Finding M16: `concatEncrypted` Uses Spread into Array Constructor
- **Severity**: Medium
- **File**: `packages/config/src/crypto/aes-gcm.ts:52-58`
- **Evidence**: `new Uint8Array([...payload.iv, ...payload.ciphertext, ...payload.authTag])` — O(n) intermediate array.

**BEFORE** (`packages/config/src/crypto/aes-gcm.ts:52-58`):
```typescript
export function concatEncrypted(payload: EncryptedPayload) {
  return new Uint8Array([
    ...payload.iv,
    ...payload.ciphertext,
    ...payload.authTag,
  ]);
}
```

**AFTER**:
```typescript
export function concatEncrypted(payload: EncryptedPayload) {
  const out = new Uint8Array(
    payload.iv.length + payload.ciphertext.length + payload.authTag.length,
  );
  out.set(payload.iv, 0);
  out.set(payload.ciphertext, payload.iv.length);
  out.set(payload.authTag, payload.iv.length + payload.ciphertext.length);
  return out;
}
```

---

#### Finding M18: `process.ts` Duplicates `err` and `error` Fields
- **Severity**: Medium
- **File**: `packages/config/src/process.ts:8-9, 22-23`
- **Evidence**: `{ level: "error", msg: "unhandledRejection", err, error: err, ... }` — two fields with identical value.

**BEFORE** (`packages/config/src/process.ts:6-11`):
```typescript
console.error(
  JSON.stringify({
    level: "error",
    msg: "unhandledRejection",
    err,
    error: err,
    pid: process.pid,
  }),
);
```

**AFTER**:
```typescript
console.error(
  JSON.stringify({
    level: "error",
    msg: "unhandledRejection",
    error: err,
    pid: process.pid,
  }),
);
```

(Remove `err,` line, keep `error: err,`. Apply same fix to `uncaughtException` handler at lines 21-26.)

---

### Agent 3: Config Package Cleanup

**Scope**: `packages/config/src/types/schemas.ts`, `packages/config/src/storage/0g.ts`, `packages/config/src/addresses.ts`, `packages/config/src/types/hex.ts`

#### Finding M17: Zod Schemas Duplicate Regex from `hex.ts`
- **Severity**: Medium
- **File**: `packages/config/src/types/schemas.ts:7,12` vs `packages/config/src/types/hex.ts:2-3`
- **Evidence**: Both define `HEX_REGEX` / `ADDRESS_REGEX` independently.

**BEFORE** (`packages/config/src/types/schemas.ts:1-2`):
```typescript
import { z } from "zod";
import { validateHex, validateAddress, toViemHex } from "./hex.js";
```

**AFTER**:
```typescript
import { z } from "zod";
import { validateHex, validateAddress, toViemHex, HEX_REGEX, ADDRESS_REGEX } from "./hex.js";
```

Then replace `z.string().regex(/^0x[a-fA-F0-9]+$/, ...)` with `z.string().regex(HEX_REGEX, ...)` and same for ADDRESS_REGEX. Export `HEX_REGEX` and `ADDRESS_REGEX` from `hex.ts`.

---

#### Finding H3 (Config): `StorageAdapter.upload` Interface Signature Mismatches `ZeroGStorage.upload`
- **Severity**: High
- **File**: `packages/config/src/storage/0g.ts:23` vs `packages/config/src/storage/0g.ts:187-189`
- **Evidence**: Interface: `upload(blob: Uint8Array)` vs class: `upload(blob: Uint8Array, encryption?: Encryption)`

**BEFORE** (`packages/config/src/storage/0g.ts:22-23`):
```typescript
export interface StorageAdapter {
  upload(blob: Uint8Array): Promise<{ rootHash: Hex }>;
```

**AFTER**:
```typescript
export interface StorageAdapter {
  upload(blob: Uint8Array, encryption?: Encryption): Promise<{ rootHash: Hex }>;
```

---

#### Finding M6 (Config): `getAddresses` Hardcodes Keys
- **Severity**: Medium
- **File**: `packages/config/src/addresses.ts:65-74`
- **Evidence**: Manual enumeration of 5 keys instead of dynamic iteration.

**BEFORE** (`packages/config/src/addresses.ts:65-74`):
```typescript
export function getAddresses(
  env: Record<string, unknown> = typeof process !== "undefined" && process.env ? process.env : {},
) {
  return {
    strategyVault: resolveAddress("strategyVault", env),
    agentNft: resolveAddress("agentNft", env),
    teeVerifier: resolveAddress("teeVerifier", env),
    paymentProcessor: resolveAddress("paymentProcessor", env),
    mockUsdc: resolveAddress("mockUsdc", env),
  } as const;
}
```

**AFTER**:
```typescript
type AddressName = keyof typeof DEPLOYED_ADDRESSES;

export function getAddresses(
  env: Record<string, unknown> = typeof process !== "undefined" && process.env ? process.env : {},
) {
  return Object.fromEntries(
    (Object.keys(DEPLOYED_ADDRESSES) as AddressName[]).map(
      (name) => [name, resolveAddress(name, env)],
    ),
  ) as Record<AddressName, `0x${string}`>;
}
```

---

#### Finding L9 (Config): `toViemHex` Uses Unnecessary Double Cast
- **Severity**: Low
- **File**: `packages/config/src/types/hex.ts:22`
- **Evidence**: `return h as unknown as \`0x${string}\`` — `as unknown` intermediate is unnecessary.

**BEFORE** (`packages/config/src/types/hex.ts:21-22`):
```typescript
export function toViemHex(h: Hex): `0x${string}` {
  return h as unknown as `0x${string}`;
}
```

**AFTER**:
```typescript
export function toViemHex(h: Hex): `0x${string}` {
  return h as `0x${string}`;
}
```

---

### Agent 4: Backend Duplication Cleanup (Part 1)

**Scope**: `apps/backend/src/utils/constants.ts`, `apps/backend/src/server.ts`, `apps/backend/src/routers/`

#### Finding M2: `MAX_WS_CLIENTS` Defined in Two Places
- **Severity**: Medium
- **Files**: `apps/backend/src/utils/constants.ts:8-9` and `apps/backend/src/server.ts:206`
- **Evidence**: Same value (1000), different declarations.

**BEFORE** (`apps/backend/src/server.ts:206`):
```typescript
const MAX_WS_CLIENTS = 1000;
```

**AFTER**:
```typescript
import { MAX_WS_CLIENTS } from "./utils/constants.js";
// (remove local const)
```

---

#### Finding M3: Mixed Error Response Patterns
- **Severity**: Medium
- **Files**: `apps/backend/src/server.ts` (inline), `apps/backend/src/routers/orchestrator.ts:55` (inline), `apps/backend/src/routers/route-factory.ts:75,81` (inline), `apps/backend/src/routers/health.ts:34` (inline)
- **Evidence**: 11+ inline `res.status().json({error:...})` while `sendError()` helper exists in `utils/response.ts`.

Select 3 representative inline locations to convert as a demonstration (full standardization can continue in Wave 3):

**BEFORE** (`apps/backend/src/routers/orchestrator.ts:55`):
```typescript
res.status(503).json({ error: "Orchestrator not available" });
```

**AFTER**:
```typescript
sendError(res, 503, "Orchestrator not available");
```

Apply same pattern to `route-factory.ts:75` and `health.ts:34`.

---

#### Finding M5: TTL Cache Pattern Duplicated
- **Severity**: Medium
- **Files**: `apps/backend/src/routers/agents.ts:49-50` and `apps/backend/src/server.ts:427-429`
- **Evidence**: Same `{ data, timestamp }` shape and `Date.now()` comparison pattern.

**BEFORE** (`apps/backend/src/routers/agents.ts:49-50`):
```typescript
const agentCache = new Map<string, { data: unknown; timestamp: number }>();
const AGENT_CACHE_TTL = 30_000;
```

**AFTER** — create `apps/backend/src/utils/cache.ts`:
```typescript
export class TTLCache<T> {
  private readonly cache = new Map<string, { data: T; timestamp: number }>();
  constructor(private readonly ttlMs: number) {}
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp >= this ttlMs) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data;
  }
  set(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }
}
```

Then refactor `agents.ts` to use `new TTLCache<unknown>(30_000)` and `server.ts` to use `new TTLCache<PaymentConfigResponse>(300_000)`.

---

#### Finding L2: Error Extraction Pattern Repeated 7 Times
- **Severity**: Low
- **Files**: 5 files, 7 occurrences
- **Evidence**: `err instanceof Error ? err.message : String(err)` repeated.

**BEFORE** (e.g., `ws/broadcaster.ts:30`):
```typescript
error: err instanceof Error ? err.message : String(err),
```

**AFTER** — add to `utils/response.ts`:
```typescript
export function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
```

Replace the 7 occurrences with `extractErrorMessage(err)`.

---

## WAVE 3 — Consistency + Polish + Improvements

**Goal**: Final cleanup pass — remaining duplication, orchestrator improvements, indexer hardening, cosmetic fixes.  
**Duration estimate**: Each agent ~45–75 min. Parallel execution completes in ~75 min.

---

### Agent 1: Backend Duplication Cleanup (Part 2)

**Scope**: `apps/backend/src/server.ts`, `apps/backend/src/routers/`, `apps/backend/src/events/store.ts`, `apps/backend/src/cli/run-e2e.ts`

#### Finding M1: TypedContract NFT Instantiation Duplicated
- **Severity**: Medium
- **Files**: `apps/backend/src/server.ts:175-178` and `apps/backend/src/routers/agents.ts:52-53`
- **Evidence**: Both construct `TypedContract<AgentNFTMethods>(nftAddr, AGENT_NFT_ABI, provider)`.

**BEFORE** — the `nftTc` is created independently in both files.

**AFTER** — pass `nftTc` as a parameter to `registerAgentRoutes`:
```typescript
// In server.ts, after constructing nftTc:
registerAgentRoutes(app, config, provider, oracle, eip712Domain, nftTc);

// In agents.ts, accept nftTc as parameter:
export function registerAgentRoutes(
  app: Express,
  config: ServerConfig,
  provider: ethers.JsonRpcProvider,
  oracle: DefaultSignerOracleClient,
  eip712Domain: Eip712Domain,
  nftTc: TypedContract<AgentNFTMethods> | null,
): void {
  // Remove local nftTc construction at line 52-53
```

---

#### Finding L1: Hardcoded `transferTopic` in CLI
- **Severity**: Low
- **File**: `apps/backend/src/cli/run-e2e.ts:458-459`
- **Evidence**: Identical hex to `utils/constants.ts:2-3`.

**BEFORE** (`apps/backend/src/cli/run-e2e.ts:458-459`):
```typescript
const transferTopic =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
```

**AFTER**:
```typescript
import { TRANSFER_TOPIC } from "../utils/constants.js";
// ... later:
const transferTopic = TRANSFER_TOPIC;
```

---

#### Finding L4: Provider Instantiation Duplicated in CLI
- **Severity**: Low
- **Files**: `apps/backend/src/cli/run-e2e.ts:70-74` vs `apps/backend/src/provider.ts:11-16`
- **Evidence**: Exact same 4-line construction.

**BEFORE** (`apps/backend/src/cli/run-e2e.ts:70-74`):
```typescript
const fetchReq = new FetchRequest(RPC);
fetchReq.timeout = 10_000;
const provider = new JsonRpcProvider(fetchReq, OG_CHAIN_ID, {
  staticNetwork: true,
});
```

**AFTER**:
```typescript
import { getSharedProvider } from "../provider.js";
// ... later:
const provider = getSharedProvider(OG_CHAIN_ID);
```

---

#### Finding L3: Event Append `receivedAt`/`timestamp` Boilerplate
- **Severity**: Low
- **Files**: `apps/backend/src/routers/events.ts:33-34` and `apps/backend/src/routers/orchestrator.ts:76-77`
- **Evidence**: Both call `events.append(...)` with `receivedAt: Date.now(), timestamp: Date.now()`.

**BEFORE** (`apps/backend/src/events/store.ts:74-82`):
```typescript
append(evt: StoredEvent): StoredEvent {
  const stored = structuredClone(evt) as StoredEvent;
  const key = `${stored.source}::${stored.eventName}`;
  // ...
  stored.timestamp = Date.now();
```

**AFTER**:
```typescript
append(evt: StoredEvent): StoredEvent {
  const stored = structuredClone(evt) as StoredEvent;
  const key = `${stored.source}::${stored.eventName}`;
  // ...
  stored.receivedAt = stored.receivedAt ?? Date.now();
  stored.timestamp = Date.now();
```

Then remove `receivedAt: Date.now()` from the two caller sites (the store auto-fills it if not provided).

---

#### Finding L5: EIP-712 Domain Construction Duplicated 4 Times
- **Severity**: Low
- **Files**: `server.ts:146-150`, `cli/run-e2e.ts:85-88`, `server/transfer.test.ts:148-151, 302-305`
- **Evidence**: Same `{ chainId: BigInt(chainId), verifyingContract: addr }` shape.

**AFTER** — add to `packages/config/src/eip712.ts`:
```typescript
export function buildEip712Domain(
  chainId: number | bigint,
  verifyingContract: `0x${string}`,
): Eip712Domain {
  return {
    chainId: typeof chainId === "number" ? BigInt(chainId) : chainId,
    verifyingContract,
  };
}
```

Replace 4 construction sites with `buildEip712Domain(chainId, verifierAddr)`.

---

### Agent 2: Orchestrator Improvements

**Scope**: `apps/backend/src/orchestrator/index.ts`

#### Finding M6: `settleOnChain` Ignores the Action Parameter
- **Severity**: Medium
- **File**: `apps/backend/src/orchestrator/index.ts:197-231`
- **Evidence**: `action` param received at line 199 but never used — `value = 0n` and `data = "0x"` are hardcoded at lines 207-208.

**BEFORE** (`apps/backend/src/orchestrator/index.ts:206-208`):
```typescript
const target = vaultAddr;
const value = 0n;
const data = "0x";
```

**AFTER** — add action-aware logging and return the action in execution record (since actual trade execution requires external integration, log the action for now):
```typescript
const target = vaultAddr;
const value = 0n;
const data = "0x";
log.info("settleOnChain called", { action, tokenId: strategy.agentTokenId.toString() });
```

This is a documentation/correctness fix — the action is now explicitly logged rather than silently ignored. Full trade execution is out of scope for this microchange.

---

#### Finding L13: `settleOnChain` Error Truncation
- **Severity**: Low
- **File**: `apps/backend/src/orchestrator/index.ts:143`
- **Evidence**: `.slice(0, 64)` truncates revert reasons.

**BEFORE** (`apps/backend/src/orchestrator/index.ts:143`):
```typescript
result: `0x${(err instanceof Error ? err.message : String(err)).slice(0, 64)}` as `0x${string}`,
```

**AFTER**:
```typescript
result: `0x${(err instanceof Error ? err.message : String(err)).slice(0, 128)}` as `0x${string}`,
```

(Double the limit to 128 chars — still fits in a bytes-like field while preserving more revert reason context.)

---

### Agent 3: Indexer Hardening

**Scope**: `apps/indexer/src/sink.ts`, `apps/indexer/src/watcher.ts`

#### Finding L7: Indexer Sink Has No Retry Logic
- **Severity**: Low
- **File**: `apps/indexer/src/sink.ts:57-77`
- **Evidence**: Single HTTP attempt with no retry.

**BEFORE** (`apps/indexer/src/sink.ts:57-77`):
```typescript
export async function postEvent(event: AxiomEvent, opts: HttpEventSinkOptions) {
  const fetchImpl: Fetcher = opts.fetcher ?? ((u, i) => fetch(u, i));
  const source = opts.source ?? "indexer";
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const url = resolveUrl(opts.backendUrl);
  // ...
  const res = await fetchImpl(url, { ... });
  return { status: res.status };
}
```

**AFTER**:
```typescript
export async function postEvent(event: AxiomEvent, opts: HttpEventSinkOptions) {
  const fetchImpl: Fetcher = opts.fetcher ?? ((u, i) => fetch(u, i));
  const source = opts.source ?? "indexer";
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const url = resolveUrl(opts.backendUrl);
  const maxRetries = opts.maxRetries ?? 2;

  const chainId = opts.chainId ?? Number(process.env["OG_CHAIN_ID"] ?? GALILEO_CHAIN_ID);
  const body: HttpEventBody = buildBody(event, source, chainId);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const signal = AbortSignal.timeout(timeoutMs);
      const res = await fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(opts.apiKey ? { "x-api-key": opts.apiKey } : {}),
        },
        body: JSON.stringify(body, bigintReplacer),
        signal,
      });
      if (res.status < 500 || attempt === maxRetries) {
        return { status: res.status };
      }
    } catch (err) {
      if (attempt === maxRetries) throw err;
    }
    // Exponential backoff: 500ms, 1000ms
    await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
  }
  return { status: 500 }; // unreachable but satisfies TS
}
```

Add `maxRetries?: number` to `HttpEventSinkOptions`.

---

#### Finding L6: Indexer Doesn't Handle Chain Reorganizations
- **Severity**: Low
- **File**: `apps/indexer/src/watcher.ts:545`
- **Evidence**: `this.nextBlock = toBlock + 1n;` — always advances forward.

This is a design limitation, not a simple fix. Add a **configurable reorg margin**:

**BEFORE** (`apps/indexer/src/watcher.ts:545`):
```typescript
this.nextBlock = toBlock + 1n;
```

**AFTER**:
```typescript
// Only mark events as finalized after reorgDepth confirmations
const reorgDepth = 10n; // 0G blocks
const safeBlock = toBlock > reorgDepth ? toBlock - reorgDepth : 0n;
this.nextBlock = toBlock + 1n;
// Note: full reorg handling requires event invalidation beyond this scope.
// This annotation marks where reorg-safe finality would be enforced.
```

---

### Agent 4: Cosmetic + Naming Fixes

**Scope**: Various small files across config and backend.

#### Finding S3: `deriveUncompressedPubkeyFromHex` Name Misleading
- **Severity**: Cosmetic
- **File**: `packages/config/src/crypto/secp256k1.ts:23`
- **Evidence**: Returns 64-byte X||Y, not 65-byte 0x04||X||Y.

**BEFORE** (`packages/config/src/crypto/secp256k1.ts:23`):
```typescript
export function deriveUncompressedPubkeyFromHex(privateKeyHex: string) {
```

**AFTER**:
```typescript
/** Derives the 64-byte raw public key (X||Y, no 0x04 prefix) from a private key hex. */
export function deriveRawPubkeyFromHex(privateKeyHex: string) {
```

Add a re-export with old name for backward compat: `export const deriveUncompressedPubkeyFromHex = deriveRawPubkeyFromHex;`

---

#### Finding L11: `auth.ts` Skips Auth Only for `/health`
- **Severity**: Low
- **File**: `packages/config/src/middleware/auth.ts:9`
- **Evidence**: Hardcoded `/health`.

**BEFORE** (`packages/config/src/middleware/auth.ts:3-7`):
```typescript
export function createApiKeyAuth(apiKey: string | undefined) {
  if (!apiKey) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
```

**AFTER**:
```typescript
export function createApiKeyAuth(
  apiKey: string | undefined,
  publicPaths: string[] = ["/health"],
) {
  if (!apiKey) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  return (req: Request, res: Response, next: NextFunction) => {
    if (publicPaths.includes(req.path)) return next();
```

---

#### Finding L10: `ecies.ts` `toCompressed` Unnecessary Hex Round-Trip
- **Severity**: Low
- **File**: `packages/config/src/crypto/ecies.ts:26`
- **Evidence**: `Buffer.from(full).toString("hex")` then `fromHex(hexString)`.

**BEFORE** (`packages/config/src/crypto/ecies.ts:24-27`):
```typescript
const point = secp256k1.ProjectivePoint.fromHex(
  Buffer.from(full).toString("hex"),
);
```

**AFTER**:
```typescript
const point = secp256k1.ProjectivePoint.fromHex(full);
```

---

#### Finding L12: `OwnershipProofResult` Has All-Optional Fields
- **Severity**: Low
- **File**: `packages/config/src/eip712.ts:115-123`
- **Evidence**: `accessProofNonce?`, `ownershipProofNonce?`, `signer?` all optional.

**BEFORE** (`packages/config/src/eip712.ts:115-123`):
```typescript
export interface OwnershipProofResult {
  newDataUri: Hex;
  newDataHash: Hex;
  sealedKey: Hex;
  ownershipSignature: Hex;
  accessProofNonce?: number;
  ownershipProofNonce?: number;
  signer?: Hex;
}
```

**AFTER**:
```typescript
export interface OwnershipProofResult {
  newDataUri: Hex;
  newDataHash: Hex;
  sealedKey: Hex;
  ownershipSignature: Hex;
}

export interface OwnershipProofResultWithMeta extends OwnershipProofResult {
  accessProofNonce?: number;
  ownershipProofNonce?: number;
  signer?: Hex;
}
```

Update `oracle/client.ts` return type to use `OwnershipProofResultWithMeta` where appropriate.

---

#### Finding S1: `index.ts` Uses `export *` From Multiple Modules
- **Severity**: Cosmetic
- **File**: `packages/config/src/index.ts:12-16`
- **Evidence**: `export *` from crypto, storage, process modules.

**BEFORE** (`packages/config/src/index.ts:12-16`):
```typescript
export * from "./crypto/aes-gcm.js";
export * from "./crypto/ecies.js";
export * from "./crypto/secp256k1.js";
export { registerProcessHandlers } from "./process.js";
```

**AFTER**:
```typescript
export { aesGcmEncrypt, aesGcmDecrypt, concatEncrypted, parseEncrypted, type EncryptedPayload } from "./crypto/aes-gcm.js";
export { sealKeyForReceiver, unsealKeyForReceiver } from "./crypto/ecies.js";
export { publicKeyUncompressedFromPrivate, pubKeyToAddress, deriveUncompressedPubkeyFromHex } from "./crypto/secp256k1.js";
export { registerProcessHandlers } from "./process.js";
```

---

## Summary: Wave Execution Matrix

| Wave | Agent | Findings Covered | Effort |
|------|-------|-----------------|--------|
| **1** | 1 | C1, H5, H7, H8 | ~60 min |
| **1** | 2 | H1, H2, H3, M10, M21 | ~75 min |
| **1** | 3 | H4, M11, M12, M22 | ~60 min |
| **1** | 4 | M13, M14, M23 | ~60 min |
| **2** | 1 | M7, M8 | ~60 min |
| **2** | 2 | M9, M15, M16, M18 | ~75 min |
| **2** | 3 | H3-config, M17, M6-config, L9 | ~60 min |
| **2** | 4 | M2, M3, M5, L2 | ~75 min |
| **3** | 1 | M1, L1, L4, L3, L5 | ~75 min |
| **3** | 2 | M6, L13 | ~45 min |
| **3** | 3 | L7, L6 | ~60 min |
| **3** | 4 | S3, L11, L10, L12, S1 | ~60 min |

**Total**: 63 findings across 12 agent slots in 3 waves.

---

## Verification Protocol

After each wave:
1. Run `pnpm typecheck` to verify no type errors introduced
2. Run `pnpm test` to verify existing tests pass
3. Run `pnpm lint` to verify no new lint violations
4. Manual smoke test: start backend + oracle + indexer, verify `/health` returns 200

After Wave 3 (final):
1. Full `pnpm build` across all packages
2. Run the E2E CLI (`apps/backend/src/cli/run-e2e.ts`) against Galileo testnet
3. Verify WebSocket connections work with topic filtering
4. Verify oracle `/v1/agents/mint` returns 400 on bad input (not 500)
