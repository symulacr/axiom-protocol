# Data Flow & Missing Logic Analysis — Group B

**Scope**: Business Logic (Orchestrator, Compute, Payment), Oracle, Indexer
**Files analyzed**: 20 files across `apps/backend`, `apps/oracle`, `apps/indexer`
**Date**: 2026-07-05

---

## 1. Executive Summary

The codebase implements a multi-service architecture: an **orchestrator** that runs AI agent strategy ticks (compute → parse → settle), an **oracle** that signs ownership/access proofs for NFT data transfers, and an **indexer** that watches on-chain events and fans them out to an HTTP sink and 0G Storage. I identified **23 findings** across data flow breaks, missing validation, logic gaps, and structural issues. The most critical are: a model parameter silently ignored after first call, TEE verification that's documented as best-effort but actually blocks and throws, missing chatId plumbing that degrades TEE verification, and an indexer event buffer re-buffering algorithm that incorrectly drops events.

---

## 2. Detailed Findings

### FINDING 1 — Model parameter silently ignored after first call

**Issue**: `getClient()` caches the OpenAI client on first invocation and ignores the `model` parameter on all subsequent calls.

**Location**: `apps/backend/src/orchestrator/index.ts:100-105`

**Evidence**:
```typescript
private async getClient(model?: string): Promise<OpenAI> {
  if (!this.openai) {
    this.openai = await createRouterClient(model);
  }
  return this.openai; // <-- model param ignored on second+ call
}
```

**Why it's a problem**: If a strategy's `computeModel` changes mid-session (e.g., different strategies with different models, or a model upgrade), the orchestrator continues using the first model ever resolved. The model parameter in `runInference` (line 325, 348) is passed to `getClient()` but only takes effect once.

---

### FINDING 2 — TEE verification documented as "best-effort" but actually blocks/throws

**Issue**: The tee-verifier.ts docstring says "intentionally best-effort — never blocks the tick" (line 8), but `verifyTeeAsync` in the orchestrator awaits it and throws on failure, which aborts the entire tick.

**Location**: `apps/backend/src/compute/tee-verifier.ts:8` and `apps/backend/src/orchestrator/index.ts:124-126, 300-304`

**Evidence**:
```typescript
// tee-verifier.ts:8 — "intentionally best-effort — never blocks the tick"

// orchestrator/index.ts:124-126
if (process.env.AXIOM_COMPUTE_VERIFY_TEE === "true") {
  await this.verifyTeeAsync(rawModelOutput); // THROWS on line 301-303
}

// orchestrator/index.ts:300-303
if (result === false) {
  throw new Error(`TEE response verification failed for provider ${providerAddress}`);
}
```

**Why it's a problem**: The documentation and the implementation contradict each other. A TEE verification failure kills the entire tick (including valid on-chain state and storage reads), which is a much stronger guarantee than "best-effort." This should either be documented as blocking, or caught and logged.

---

### FINDING 3 — TEE verification never receives chatId, degrading verification

**Issue**: The orchestrator calls `verifyTeeResponse` without the `chatId`, but the chatId is available after inference via `clientChatIdMap`.

**Location**: `apps/backend/src/orchestrator/index.ts:287-292` and `apps/backend/src/compute/router.ts:110-111, 154-157`

**Evidence**:
```typescript
// orchestrator/index.ts:287-292 — chatId is never passed
const result = await verifyTeeResponse(
  this.chainId,
  this.signer,
  providerAddress,
  rawModelOutput,
  // chatId missing!
);

// router.ts:110-111 — chatId IS tracked per client
export const clientChatIdMap = new WeakMap<object, string>();

// router.ts:154-157 — chatId IS extracted from response headers
const chatIdHeader = res.headers.get("x-chat-id") || res.headers.get("chat-id");
if (chatIdHeader && client) {
  clientChatIdMap.set(client, chatIdHeader);
}
```

**Why it's a problem**: The SDK's `processResponse` uses `chatId` to verify the provider's TEE signature against the specific chat session. Without it, verification is degraded (the function returns `null` for "skipped"). The plumbing exists (WeakMap in router.ts) but is never connected to the orchestrator's TEE flow.

---

### FINDING 4 — settleOnChain ignores the recommended action entirely

**Issue**: The `action` parameter to `settleOnChain` is passed through but never used in the actual on-chain call. The vault.execute() always sends identical dummy calldata.

**Location**: `apps/backend/src/orchestrator/index.ts:197-231`

**Evidence**:
```typescript
private async settleOnChain(
  strategy: StrategySpec,
  action: string,       // <-- received but unused
): Promise<...> {
  // ...
  const value = 0n;     // hardcoded
  const data = "0x";    // hardcoded
  // ...
  const tx = await vaultTc.contract.execute(
    strategy.agentTokenId,
    target,
    value,
    data,
    proof,
  );
}
```

**Why it's a problem**: Whether the model recommends "buy" or "sell", the same zero-value no-op transaction is sent. The `action` string is only recorded in the return value for bookkeeping. If the vault.execute() is intended to perform real trades, the action should influence the calldata.

---

### FINDING 5 — Provider discovery cache is chain-agnostic (module-level globals)

**Issue**: The provider cache variables are module-level globals but `discoverProviders` accepts a `chainId` parameter that is never used as a cache key.

**Location**: `apps/backend/src/compute/provider-discovery.ts:17-20, 30-36`

**Evidence**:
```typescript
let _cachedProviders: ServiceInfo[] | null = null;  // single cache
let _cachePromise: Promise<ServiceInfo[]> | null = null;
let _cacheTimestamp = 0;

export async function discoverProviders(
  rpcUrl: string,
  chainId?: number,       // <-- not used in cache key
): Promise<ServiceInfo[]> {
  if (_cachedProviders && Date.now() - _cacheTimestamp < CACHE_TTL_MS)
    return _cachedProviders;  // <-- returns whatever chain was cached last
```

**Why it's a problem**: If the system runs against multiple chains (e.g., Galileo testnet + Aristotle mainnet), the second chain's providers overwrite the first chain's cached results. All callers after that get the wrong chain's providers.

---

### FINDING 6 — Race condition in provider discovery concurrent calls

**Issue**: Two concurrent callers can both pass the `_cachePromise` null-check and create independent IIFEs, with the second overwriting the first's promise reference.

**Location**: `apps/backend/src/compute/provider-discovery.ts:34-51`

**Evidence**:
```typescript
// Thread A and Thread B both enter discoverProviders simultaneously:
if (_cachedProviders && ...) return _cachedProviders;  // both see null
if (_cachePromise) return _cachePromise;                 // both see null
// Both enter the IIFE:
_cachePromise = (async () => { ... })();  // A sets it
// B then sets it, overwriting A's promise
```

**Why it's a problem**: The `_cachePromise` is designed as a deduplication mechanism (one in-flight request), but the race means two RPC calls fire instead of one. More critically, B's overwrite means A's result is orphaned and B's result is what gets cached — but callers waiting on A's promise get A's result (which may resolve after B).

---

### FINDING 7 — Indexer event buffer re-buffering drops wrong events

**Issue**: On flush failure, the re-buffering loop drops events from the END of `eventBuffer` (which are the NEWEST) to make room for the failed batch (which is OLDER), then unshifts the old batch to the FRONT.

**Location**: `apps/indexer/src/index.ts:78-88`

**Evidence**:
```typescript
// On storage upload failure:
const MAX_BUFFER_SIZE = 10000;
for (const _ev of batch) {
  if (eventBuffer.length >= MAX_BUFFER_SIZE) {
    const dropped = eventBuffer.pop();  // drops NEWEST events
  }
}
eventBuffer.unshift(...batch);  // prepends OLDER failed batch
```

**Why it's a problem**: When the buffer is full and a flush fails, the code drops the most recent events (which are most valuable for real-time consumers) and re-inserts the older failed batch at the front. The intent was likely to make room, but the wrong end of the buffer is trimmed.

---

### FINDING 8 — Oracle /v1/agents/mint doesn't catch ZodError

**Issue**: The `/v1/agents/mint` route calls `mintDataHashSchema.parse(req.body)` without a try/catch for ZodError, causing a 500 instead of a 400 on validation failure.

**Location**: `apps/oracle/src/server.ts:315-325`

**Evidence**:
```typescript
app.post("/v1/agents/mint", (req: Request, res: Response) => {
  const { dataHash } = mintDataHashSchema.parse(req.body); // ZodError → 500
  // ...
});
```

Compare with `/v1/ownership` (lines 200-210) which properly catches ZodError and returns 400.

**Why it's a problem**: Invalid requests hit the generic error handler (line 328-341) and return a 500 Internal Server Error instead of a 400 Bad Request with the specific validation message.

---

### FINDING 9 — Oracle transfer-validity schema marks to/nft as optional but handler requires them

**Issue**: The Zod schema declares `to` and `nft` as `.optional()`, but the handler explicitly validates they must be present and valid addresses.

**Location**: `apps/oracle/src/route-schemas.ts:11-12` and `apps/oracle/src/server.ts:111-123`

**Evidence**:
```typescript
// route-schemas.ts:11-12
to: addressViem.optional(),
nft: addressViem.optional(),

// server.ts:111-123 — explicitly rejects missing values
if (!toIn || !isAddress(toIn)) {
  res.status(400).json({ error: "'to' address is required..." });
  return;
}
if (!nftIn || !isAddress(nftIn)) {
  res.status(400).json({ error: "'nft' address is required..." });
  return;
}
```

**Why it's a problem**: The schema says these are optional; the handler says they're required. This inconsistency means Zod validation passes but the handler rejects — a confusing double-validation with conflicting semantics. The schema should enforce `.required()` to match the handler's expectations.

---

### FINDING 10 — Broker caches never invalidate (stale provider references)

**Issue**: The `_readOnlyCache` and `_brokerCache` in broker.ts grow unbounded and are never evicted, even when providers go offline or networks change.

**Location**: `apps/backend/src/compute/broker.ts:62-63, 79-80`

**Evidence**:
```typescript
const _readOnlyCache = new Map<number, ReadOnlyInferenceBroker>();
const _brokerCache = new Map<number, ZGComputeNetworkBroker>();
// No TTL, no eviction, no invalidation API
```

Note: `provider-discovery.ts` has `invalidateProviderCache()` (line 67) but this only clears its own cache, not the broker-level caches that hold the actual SDK broker instances.

**Why it's a problem**: If a provider goes offline or the chain state changes, stale broker instances continue to be used. The `getReadOnlyBroker` is called from `verifyTeeAsync` (orchestrator:271), `resolveProviderUrl` (router:75), and `discoverProviders` (provider-discovery:39) — all paths use the stale cached broker.

---

### FINDING 11 — Payment processor ensureAllowance doesn't handle infinite approval pattern

**Issue**: Each payment transaction requires an ERC-20 approval tx, doubling gas costs. A common pattern is to approve MAX_UINT256 once.

**Location**: `apps/backend/src/payment/processor.ts:167-175`

**Evidence**:
```typescript
private async ensureAllowance(amount: bigint): Promise<void> {
  const current = await this.token.contract.allowance(this.signer.address, this.address);
  if (current >= amount) return;
  const tx = await this.token.contract.approve(this.address, amount); // exact amount
  await tx.wait();
}
```

**Why it's a problem**: Every `payForAgent` and `payComputeProvider` call triggers two transactions: one approval + one payment. For a system processing many ticks, this is significant gas overhead. An approve-to-MAX pattern with a one-time setup would halve gas costs.

---

### FINDING 12 — parseRecommendation doesn't validate amount bounds

**Issue**: The `amount` field from model output is accepted as any number without bounds checking, including negative, NaN, Infinity, or extremely large values.

**Location**: `apps/backend/src/orchestrator/index.ts:164-195`

**Evidence**:
```typescript
return {
  action,
  amount: typeof parsed.amount === "number" ? parsed.amount : undefined,
  // No validation: -1e18, Infinity, NaN, Number.MAX_VALUE all pass
```

**Why it's a problem**: A compromised or malfunctioning model could recommend `{"action":"sell","amount":-1000000}` or `{"action":"buy","amount":Infinity}`. Downstream code (e.g., vault.execute with a real value derived from amount) could be exploited.

---

### FINDING 13 — settleOnChain error truncation loses diagnostic info

**Issue**: Error messages from on-chain settlement failures are truncated to 64 characters, potentially losing critical revert reasons.

**Location**: `apps/backend/src/orchestrator/index.ts:143`

**Evidence**:
```typescript
result: `0x${(err instanceof Error ? err.message : String(err)).slice(0, 64)}` as `0x${string}`,
```

**Why it's a problem**: Solidity revert reasons like "AxiomVault: insufficient balance for token 42" are 42 chars, but complex reverts with encoded data can exceed 64 chars and get silently truncated. The 64-byte limit appears to be a bytes32 constraint, but it's applied to a string message.

---

### FINDING 14 — EventStore.clear() doesn't persist, causing stale reload

**Issue**: `clear()` empties all in-memory data structures but doesn't trigger persistence, so the next process restart reloads stale events from disk.

**Location**: `apps/backend/src/events/store.ts:275-280`

**Evidence**:
```typescript
clear(): void {
  this.buckets.clear();
  this.byEventName.clear();
  this.byTokenId.clear();
  this.total = 0;
  // Missing: this.persist() or this.persistDebounced()
}
```

**Why it's a problem**: If a test or admin action calls `clear()` and the process restarts, all previously-cleared events reappear from the persisted JSON file.

---

### FINDING 15 — EventStore index eviction doesn't remove empty map entries

**Issue**: `removeFromIndex` splices entries from byEventName/byTokenId arrays but never removes the empty arrays from their parent Maps.

**Location**: `apps/backend/src/events/store.ts:229-242`

**Evidence**:
```typescript
private removeFromIndex(evt: StoredEvent): void {
  const nameBucket = this.byEventName.get(evt.eventName);
  if (nameBucket) {
    const idx = nameBucket.indexOf(evt);
    if (idx !== -1) nameBucket.splice(idx, 1);
    // Missing: if (nameBucket.length === 0) this.byEventName.delete(evt.eventName);
  }
  // Same issue for byTokenId
}
```

**Why it's a problem**: Over time, the Maps accumulate empty arrays as keys (one per unique eventName and tokenId that ever had events). This is a slow memory leak. The `byEventName` Map is used in `getAll` (line 126) and iterated, so empty entries add overhead to every query.

---

### FINDING 16 — Indexer doesn't handle chain reorganizations

**Issue**: The watcher advances its cursor forward monotonically with no reorg detection or rollback logic.

**Location**: `apps/indexer/src/watcher.ts:545`

**Evidence**:
```typescript
this.nextBlock = toBlock + 1n;  // always advances forward
await saveCheckpoint(id, Number(this.nextBlock));
```

**Why it's a problem**: On chains with probabilistic finality (like 0G/Ethereum), chain reorganizations can orphan previously-indexed blocks. The watcher will have indexed events from orphaned blocks and will never re-process the canonical chain for those blocks. Events from orphaned blocks remain in the EventStore and are sent to the backend sink as if they were canonical.

---

### FINDING 17 — Indexer sink has no retry logic, events lost on transient failure

**Issue**: `postEvent` makes a single HTTP request with no retry. Transient network failures silently drop events.

**Location**: `apps/indexer/src/sink.ts:57-77` and `apps/indexer/src/index.ts:153-161`

**Evidence**:
```typescript
// sink.ts — single attempt
const res = await fetchImpl(url, { ... });
return { status: res.status };

// index.ts — error is only logged, not retried
} catch (err) {
  process.stderr.write(
    JSON.stringify({ level: "error", msg: "http sink failed", ... }) + "\n",
  );
}
```

**Why it's a problem**: If the backend is temporarily unavailable (restart, deployment, network blip), all events during that window are permanently lost. The 0G Storage path (line 164-173) buffers and retries, but the HTTP path to the backend does not.

---

### FINDING 18 — Wayback service makes unbounded parallel requests without rate limiting

**Issue**: `lookupAccountTweets` fires 2 parallel CDX API requests with no rate limiting, retry logic, or backoff.

**Location**: `apps/backend/src/services/wayback.ts:74-98`

**Evidence**:
```typescript
const results = await Promise.all(
  queries.map(async (baseUrl) => {
    const cdxUrl = `https://web.archive.org/cdx/search/cdx?...`;
    const resp = await fetch(cdxUrl, { signal: AbortSignal.timeout(20_000) });
    if (!resp.ok) return [];  // returns empty on any failure, no retry
```

**Why it's a problem**: The Wayback Machine CDX API enforces rate limits (typically ~10-15 req/min for unauthenticated access). A burst of calls from multiple agents or rapid retries will get rate-limited or banned. The 429/503 responses are silently swallowed as empty arrays.

---

### FINDING 19 — Wayback closestSnapshot doesn't validate response structure

**Issue**: The response from archive.org's availability API is cast to a specific TypeScript type without runtime validation.

**Location**: `apps/backend/src/services/wayback.ts:130-143`

**Evidence**:
```typescript
const data = (await resp.json()) as {
  archived_snapshots?: { closest?: { url: string; timestamp: string } };
};
const closest = data.archived_snapshots?.closest;
if (!closest) return null;
return {
  url,
  timestamp: closest.timestamp,
  // No validation that timestamp is a valid 14-char string
  // No validation that url starts with https://web.archive.org/
```

**Why it's a problem**: If archive.org changes their API response shape, the function will either throw (accessing `.timestamp` on undefined) or return a `SnapshotSummary` with invalid data (e.g., a relative URL or malformed timestamp).

---

### FINDING 20 — Oracle recoverAccessSigner duplicates logic from @axiom/config

**Issue**: The oracle's `TeeSigner.recoverAccessSigner` reimplements public key recovery instead of delegating to the already-imported `eip712RecoverAccessSigner`.

**Location**: `apps/oracle/src/signer.ts:44-50, 82-86`

**Evidence**:
```typescript
// Line 9 — the config package function is already imported
import { recoverAccessSigner as eip712RecoverAccessSigner } from "@axiom/config/eip712";

// Line 44-50 — wrapper delegates to config
export function recoverAccessSigner(...) {
  return eip712RecoverAccessSigner(signature, input, domain);
}

// Line 82-86 — TeeSigner class IGNORES the imported function
recoverAccessSigner(signature: Hex, input: AccessProofInput): Hex {
  const digest = accessMessageHash(input, this.domain);
  const recovered = SigningKey.recoverPublicKey(getBytes(digest), signature);
  return computeAddress(recovered) as Hex;
}
```

**Why it's a problem**: Two independent implementations of the same recovery logic exist. If either changes (e.g., the config package adds checksum normalization), they'll diverge silently. The module-level function (line 44) correctly delegates, but the class method (line 82) does not.

---

### FINDING 21 — Promise.all in runTick loses partial results on any failure

**Issue**: If any of the three parallel operations (inference, onchain, storage) fails, the entire tick result is lost, even though the other operations may have succeeded.

**Location**: `apps/backend/src/orchestrator/index.ts:115-121`

**Evidence**:
```typescript
const [rawModelOutput, onchain, storage] = await Promise.all([
  this.runInference(strategy, signal, onChunk),
  this.fetchOnchainState(strategy),
  strategy.modelDataRoot === "0x" + "0".repeat(64)
    ? { rootHash: strategy.modelDataRoot, size: 0 }
    : this.fetchStoragePeek(strategy),
] as const);
```

**Why it's a problem**: If the compute provider is down, `Promise.all` rejects and the caller gets nothing — no on-chain state, no storage info. Using `Promise.allSettled` with partial-result handling would be more resilient. Each sub-result is independent and valuable on its own.

---

### FINDING 22 — EventStore persists to process.cwd()-relative path

**Issue**: The persistence directory uses `process.cwd()` which varies depending on how the process is launched.

**Location**: `apps/backend/src/events/store.ts:12-13`

**Evidence**:
```typescript
const PERSIST_DIR = join(process.cwd(), ".data");
const PERSIST_FILE = join(PERSIST_DIR, "events.json");
```

**Why it's a problem**: If the server is started from different directories (e.g., via systemd, Docker, or scripts), each launch writes to a different `.data/events.json`, silently losing all prior events. The path should be absolute or derived from a config/env variable.

---

### FINDING 23 — Oracle transfer-validity double-validates after Zod parse

**Issue**: After Zod schema validation succeeds, the handler performs redundant manual validation checks that may become inconsistent with the schema.

**Location**: `apps/oracle/src/server.ts:92-124`

**Evidence**:
```typescript
// Line 92: Zod validation
const { oldDataHash, oldDataUri, targetPubkey64, ... } = transferValiditySchema.parse(req.body);

// Lines 94-124: Manual re-validation
if (!oldDataHash || !oldDataUri || !targetPubkey64) { ... }
if (targetPubkey64.length !== 130) { ... }
if (!oldDataEncryptionKey) { ... }
if (!toIn || !isAddress(toIn)) { ... }
if (!nftIn || !isAddress(nftIn)) { ... }
```

**Why it's a problem**: The Zod schema already validates hex format and address format for these fields. The manual checks create two sources of truth. If the schema is tightened (e.g., hexViem enforces length), the manual checks may reject valid inputs or vice versa. The manual checks for `to` and `nft` are particularly redundant since Zod's `addressViem` already validates address format — but the schema marks them `.optional()` while the handler treats them as required (see Finding 9).

---

## 3. Microchange Opportunities

| # | File | Change | Impact |
|---|------|--------|--------|
| 1 | `orchestrator/index.ts:100-105` | Invalidate cached client when model changes | Fixes silent model mismatch |
| 2 | `orchestrator/index.ts:287-292` | Extract chatId from `clientChatIdMap.get(this.openai)` and pass to `verifyTeeResponse` | Enables full TEE verification |
| 3 | `orchestrator/index.ts:124-126` | Wrap `verifyTeeAsync` in try/catch and log instead of throw (or update docstring) | Aligns behavior with documented intent |
| 4 | `provider-discovery.ts:34-36` | Use `chainId` as cache key (e.g., `Map<string, ServiceInfo[]>`) | Prevents cross-chain cache corruption |
| 5 | `provider-discovery.ts:38-51` | Check-and-set `_cachePromise` atomically (set before the IIFE) | Prevents race condition double-fetch |
| 6 | `indexer/index.ts:79-88` | Reverse the drop direction: `eventBuffer.shift()` (drop oldest) instead of `eventBuffer.pop()` (drop newest) | Preserves most recent events |
| 7 | `oracle/server.ts:315-325` | Wrap `mintDataHashSchema.parse` in try/catch for ZodError | Returns 400 instead of 500 |
| 8 | `route-schemas.ts:11-12` | Change `to` and `nft` from `.optional()` to `.required()` | Aligns schema with handler semantics |
| 9 | `events/store.ts:275-280` | Add `this.persistDebounced()` call to `clear()` | Ensures cleared state survives restart |
| 10 | `events/store.ts:229-242` | Delete empty map entries after splice | Prevents slow memory leak |
| 11 | `orchestrator/index.ts:115-121` | Use `Promise.allSettled` with per-field error handling | Preserves partial results |
| 12 | `signer.ts:82-86` | Delegate `TeeSigner.recoverAccessSigner` to the imported `eip712RecoverAccessSigner` | Eliminates duplicate logic |
| 13 | `broker.ts:62-79` | Add TTL-based eviction or `clearBrokerCache(chainId?)` API | Prevents stale broker usage |
| 14 | `sink.ts:57-77` | Add 2-3 retry attempts with exponential backoff | Prevents event loss on transient failures |
