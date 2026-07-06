# Duplication & Pattern Analysis — Backend API Layer

## 1. Executive Summary

The backend API layer contains **14 distinct duplication/pattern issues** across the 18 files analyzed. The most impactful are: (1) TypedContract instantiation repeated across 3 files with identical arguments, (2) a hardcoded constant that duplicates a file-level export, (3) an error-response helper used in some files while inline `res.status().json()` is used in others, and (4) a TTL-cache pattern copy-pasted between two modules. Several of these are low-effort microchange opportunities that would improve consistency and reduce drift.

---

## 2. Detailed Findings

### Finding 1: TypedContract NFT Initialization Duplicated

**Issue**: `TypedContract<AgentNFTMethods>(nftAddr, AGENT_NFT_ABI, provider)` is constructed identically in two places, once per request context.

**Location A**: `server.ts:176-178`
```ts
const nftTc = nftAddr
  ? new TypedContract<AgentNFTMethods>(nftAddr, AGENT_NFT_ABI, provider)
  : null;
```

**Location B**: `routers/agents.ts:52-53`
```ts
const nftAddr = config.addresses?.agentNft;
const nftTc = nftAddr ? new TypedContract<AgentNFTMethods>(nftAddr, AGENT_NFT_ABI, provider) : null;
```

**Evidence**: Both use the same address source (`config.addresses?.agentNft`), same ABI (`AGENT_NFT_ABI`), and same provider. The `agents.ts` version even re-reads `config.addresses?.agentNft` into a local `nftAddr` that shadows the outer scope.

**Impact**: If the NFT contract type or initialization logic changes, both locations must be updated. The shadowed `nftAddr` variable in `agents.ts:72` (inside the GET handler) further duplicates the outer `nftAddr` from line 52.

---

### Finding 2: Hardcoded Transfer Topic vs Exported Constant

**Issue**: The Transfer event topic hash is defined as a named constant in `utils/constants.ts` but is hardcoded as a raw hex string in the CLI.

**Location A**: `utils/constants.ts:2-3`
```ts
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;
```

**Location B**: `cli/run-e2e.ts:458-459`
```ts
const transferTopic =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
```

**Evidence**: Identical hex string, different variable names, no import relationship.

**Impact**: If the topic hash ever needs updating (e.g., for a different chain), the CLI copy would be silently missed. The CLI already imports from `@axiom/config/abis` but not from `constants.ts`.

---

### Finding 3: MAX_WS_CLIENTS Defined in Two Places

**Issue**: The WebSocket client limit is a named constant in `utils/constants.ts` AND a local `const` in `server.ts`.

**Location A**: `utils/constants.ts:8-9`
```ts
export const MAX_WS_CLIENTS = 1000 as const;
```

**Location B**: `server.ts:206`
```ts
const MAX_WS_CLIENTS = 1000;
```

**Evidence**: Same value (1000), same semantic meaning. `server.ts` imports other constants from `constants.ts` (none currently, but the pattern exists) yet redeclares this one locally.

**Impact**: Two sources of truth. Changing the limit in constants.ts has no effect on the server's actual behavior.

---

### Finding 4: Mixed Error Response Patterns (sendError vs inline)

**Issue**: `utils/response.ts` exports a `sendError(res, status, message)` helper, but most error responses throughout the codebase use inline `res.status(...).json({error: ...})` instead.

**Locations using `sendError`**:
- `routers/agents.ts:28, 64, 74, 165, 169, 199, 279, 283, 302`

**Locations using inline error response**:
- `server.ts:387-389` — `res.status(500).json({ error: "AgentNFT contract not initialized" })`
- `server.ts:393-396` — `res.status(404).json({ error: "Agent creator not registered for token" })`
- `server.ts:488-490` — `res.status(400).json({ error: "Missing required fields..." })`
- `server.ts:521-522` — `res.status(400).json({ error: "Missing or invalid datas array" })`
- `server.ts:545-549` — `res.status(400).json({ error: "Validation failed", details: ... })`
- `server.ts:567-569` — `res.status(500).json({ error: "Internal server error" })`
- `routers/route-factory.ts:75-76` — `res.status(400).json({ error: "Missing id" })`
- `routers/route-factory.ts:81-82` — `res.status(500).json({ error: "... address not configured" })`
- `routers/orchestrator.ts:55` — `res.status(503).json({ error: "Orchestrator not available" })`
- `routers/health.ts:34` — `res.status(503).json({ ok: false, error: "Health check failed" })`
- `server.ts:556-558` — `res.status(status).json({ error: err.message, code: ... })`

**Impact**: Inconsistent error envelope format. `sendError` returns `{error: message}` while some inline responses include extra fields (`code`, `details`). The health endpoint even nests `ok: false` alongside `error`. This makes client-side error parsing unreliable.

---

### Finding 5: Query Parameter Parsing Boilerplate Duplicated

**Issue**: The pattern of extracting and validating a `limit` query parameter is copy-pasted across two router files with near-identical logic.

**Location A**: `routers/events.ts:50-57`
```ts
const limitRaw =
  typeof req.query.limit === "string"
    ? Number(req.query.limit)
    : undefined;
const limit =
  limitRaw !== undefined && Number.isInteger(limitRaw) && limitRaw > 0
    ? limitRaw
    : DEFAULT_EVENT_LIMIT;
```

**Location B**: `routers/performance.ts:33-40`
```ts
const limitRaw =
  typeof req.query.limit === "string"
    ? Number(req.query.limit)
    : undefined;
const limit =
  limitRaw !== undefined && Number.isInteger(limitRaw) && limitRaw > 0
    ? limitRaw
    : 500;
```

**Evidence**: Identical 8-line extraction logic. Only difference: default value (`DEFAULT_EVENT_LIMIT` vs `500`).

**Impact**: Minor code duplication, but the pattern appears in multiple GET handlers that accept pagination. A shared utility would reduce drift risk.

---

### Finding 6: TTL Cache Pattern Duplicated

**Issue**: Two independent implementations of an in-memory TTL cache with the same `{ data, timestamp }` shape and `Date.now()` comparison.

**Location A**: `routers/agents.ts:49-50, 67-69`
```ts
const agentCache = new Map<string, { data: unknown; timestamp: number }>();
const AGENT_CACHE_TTL = 30_000;
// ...
const cached = agentCache.get(owner);
if (cached && Date.now() - cached.timestamp < AGENT_CACHE_TTL) {
  res.json(cached.data);
  return;
}
```

**Location B**: `server.ts:427-429, 440-444`
```ts
let paymentConfigCache: { data: PaymentConfigResponse; timestamp: number } | null = null;
const PAYMENT_CONFIG_TTL = 300_000;
// ...
if (
  paymentConfigCache &&
  Date.now() - paymentConfigCache.timestamp < PAYMENT_CONFIG_TTL
)
  return paymentConfigCache.data;
```

**Evidence**: Same structural pattern (data + timestamp, TTL check via `Date.now()` subtraction). The payment cache adds a deduplication layer (`pendingConfigPromise`) but the core cache check is identical.

**Impact**: If the caching strategy changes (e.g., LRU eviction, max-age), both locations must be updated independently. A shared `TTLCache<T>` utility would consolidate this.

---

### Finding 7: Error Extraction Pattern Repeated 6+ Times

**Issue**: The expression `err instanceof Error ? err.message : String(err)` (or slight variant) appears in at least 6 locations.

**Locations**:
- `server.ts:166`: `err instanceof Error ? err.message : err`
- `routers/health.ts:33`: `err instanceof Error ? err.message : String(err)`
- `ws/broadcaster.ts:30`: `err instanceof Error ? err.message : String(err)`
- `ws/broadcaster.ts:55`: `err instanceof Error ? err.message : String(err)`
- `ws/broadcaster.ts:109`: `err instanceof Error ? err.message : String(err)`
- `routers/orchestrator.ts:101`: `err instanceof Error ? err.message : String(err)`
- `cli/run-e2e.ts:504`: `e instanceof Error ? e.message : String(e)`

**Evidence**: 7 occurrences across 5 files. The `server.ts:166` variant omits `String()` wrapper.

**Impact**: Low severity, but a shared `extractErrorMessage(err: unknown): string` helper would standardize behavior and avoid the subtle inconsistency at `server.ts:166` where a non-Error value would produce `[object Object]` instead of a string.

---

### Finding 8: Event Append `receivedAt`/`timestamp` Fields Duplicated

**Issue**: The event store append call always includes `receivedAt: Date.now(), timestamp: Date.now()` in both locations.

**Location A**: `routers/events.ts:33-34`
```ts
receivedAt: Date.now(),
timestamp: Date.now(),
```

**Location B**: `routers/orchestrator.ts:76-77`
```ts
receivedAt: Date.now(),
timestamp: Date.now(),
```

**Evidence**: Both call `events.append(...)` with identical field assignments. The `EventStore.append` method could auto-fill these.

**Impact**: Every new event-producing location must remember to include both fields. If the semantics of `receivedAt` vs `timestamp` diverge, callers may set them inconsistently.

---

### Finding 9: Provider Instantiation Pattern Duplicated in CLI

**Issue**: `cli/run-e2e.ts` manually creates a `JsonRpcProvider` with `FetchRequest` + timeout + `staticNetwork` instead of using the project's `getSharedProvider()` utility.

**Location A**: `provider.ts:11-16`
```ts
const fetchReq = new FetchRequest(rpcUrl);
fetchReq.timeout = 10_000;
_provider = new JsonRpcProvider(fetchReq, chainId, {
  staticNetwork: true,
});
```

**Location B**: `cli/run-e2e.ts:70-74`
```ts
const fetchReq = new FetchRequest(RPC);
fetchReq.timeout = 10_000;
const provider = new JsonRpcProvider(fetchReq, OG_CHAIN_ID, {
  staticNetwork: true,
});
```

**Evidence**: Exact same 4-line construction with identical options.

**Impact**: If the provider configuration changes (e.g., retry policy, connection pooling), the CLI version won't pick it up. The CLI could import `getSharedProvider` from `provider.ts`.

---

### Finding 10: EIP-712 Domain Construction Duplicated 4 Times

**Issue**: The `Eip712Domain` object `{ chainId: BigInt(chainId), verifyingContract: addr }` is constructed in 4 separate locations.

**Locations**:
- `server.ts:146-150`
- `cli/run-e2e.ts:85-88`
- `server/transfer.test.ts:148-151`
- `server/transfer.test.ts:302-305`

**Evidence**: All four construct the same shape with chain ID and verifier address.

**Impact**: Test and CLI code could drift from the server's canonical construction. A factory function (e.g., `buildEip712Domain(chainId, verifier)`) would centralize this.

---

### Finding 11: Archive Route Registration Boilerplate

**Issue**: Four archive routes in `server.ts:308-373` follow an identical pattern: create route with `consumer: "useArchive"`, call a service function, return result.

**Locations**: `server.ts:308-373` — lines 308-322, 324-341, 343-356, 358-372

**Evidence**: All four routes:
1. Call `createRoute(archiveRouter, {..., consumer: "useArchive"}, async (parsed) => {...}, config)`
2. Have the same shape: path, schema, consumer, description, handler
3. Handlers are thin wrappers around `wayback.ts` service functions

**Impact**: 65 lines of near-identical registration code that could be replaced by a data-driven loop or a shared `registerArchiveRoutes(router, config)` function (similar to how `registerAgentRoutes` works).

---

### Finding 12: WebSocket readyState Check Repeated

**Issue**: The pattern `socket.readyState !== socket.OPEN` (or equivalent) is checked in multiple places across server and broadcaster.

**Locations**:
- `server.ts:210`: `c.socket.readyState !== c.socket.OPEN`
- `ws/broadcaster.ts:24`: `c.socket.readyState !== c.socket.OPEN`
- `ws/broadcaster.ts:50`: `client.socket.readyState === WebSocket.OPEN`
- `ws/broadcaster.ts:100`: `client.socket.readyState !== WebSocket.OPEN`

**Evidence**: Same semantic check, sometimes using `c.socket.OPEN` (instance property) and sometimes `WebSocket.OPEN` (static property). Both are valid but inconsistent.

**Impact**: Minor inconsistency. If the ready-state logic needs wrapping (e.g., adding a `isAlive` check), four locations must be updated.

---

### Finding 13: Step Logging Boilerplate in CLI

**Issue**: `cli/run-e2e.ts` repeats a console.log + stepResults.push pattern for every step (steps 1-10).

**Locations**: `cli/run-e2e.ts` lines 159-171 (step 1), 173-182 (step 2), 184-207 (step 3), 209-225 (step 4), 227-246 (step 5), 249-257 (step 6), 258-266 (step 7)

**Evidence**: Each step follows: `console.log("[Step N] ...")` → execute logic → `stepResults.push({ step: N, name: "...", ok: ..., summary: ... })`. The `postStep` helper (lines 134-157) already extracts this for HTTP steps, but manual steps (1-7) repeat it inline.

**Impact**: The `postStep` helper exists but is only used for POST requests (steps 8-9). Steps 1-7 each manually push to `stepResults`. Extending `postStep` to handle GET requests and non-HTTP steps would reduce ~80 lines of boilerplate.

---

### Finding 14: NFT Contract Null-Check Pattern Duplicated

**Issue**: Multiple handlers check `if (!nftTc)` or `if (!nftAddr)` and return an error, repeated across server.ts and agents.ts.

**Locations**:
- `server.ts:387-389`: `if (!nftTc) { res.status(500).json({ error: "AgentNFT contract not initialized" }); return; }`
- `server.ts:516-519`: `if (!nftTc) { res.status(500).json({ error: "AgentNFT contract not initialized" }); return; }`
- `routers/agents.ts:72-76`: `if (!nftAddr) { sendError(res, 503, "Agent NFT address not configured"); return; }`

**Evidence**: Three locations, two different error messages ("not initialized" vs "not configured"), two different status codes (500 vs 503), two different mechanisms (inline vs sendError).

**Impact**: Inconsistent error messaging and status codes for the same underlying condition. A guard function or middleware would standardize this.

---

## 3. Microchange Opportunities

| # | Change | Files | Effort | Impact |
|---|--------|-------|--------|--------|
| 1 | Import `TRANSFER_TOPIC` in `run-e2e.ts` instead of hardcoding | `cli/run-e2e.ts`, `utils/constants.ts` | 2 min | Eliminates Finding 2 |
| 2 | Import `MAX_WS_CLIENTS` in `server.ts` instead of redeclaring | `server.ts`, `utils/constants.ts` | 2 min | Eliminates Finding 3 |
| 3 | Standardize on `sendError()` in all error paths (or remove it) | `server.ts`, `routers/orchestrator.ts`, `routers/health.ts`, `routers/route-factory.ts` | 15 min | Eliminates Finding 4 |
| 4 | Extract `parseQueryLimit(req, defaultLimit)` utility | `utils/`, `routers/events.ts`, `routers/performance.ts` | 10 min | Eliminates Finding 5 |
| 5 | Extract `TTLCache<T>` class | `utils/cache.ts`, `routers/agents.ts`, `server.ts` | 15 min | Eliminates Finding 6 |
| 6 | Extract `extractErrorMessage(err: unknown): string` utility | `utils/`, 5 files | 5 min | Eliminates Finding 7 |
| 7 | Auto-fill `receivedAt`/`timestamp` in `EventStore.append()` | `events/store.ts`, `routers/events.ts`, `routers/orchestrator.ts` | 5 min | Eliminates Finding 8 |
| 8 | Use `getSharedProvider()` in CLI | `cli/run-e2e.ts`, `provider.ts` | 3 min | Eliminates Finding 9 |
| 9 | Extract `buildEip712Domain(chainId, verifier)` factory | `@axiom/config`, 4 call sites | 10 min | Eliminates Finding 10 |
| 10 | Extract shared NFT contract guard/middleware | `server.ts`, `routers/agents.ts` | 10 min | Eliminates Finding 14 |
| 11 | Refactor archive routes into data-driven registration | `server.ts` | 15 min | Eliminates Finding 11 |
| 12 | Extract `NftContract` helper to create once and share | `server.ts`, `routers/agents.ts` | 5 min | Eliminates Finding 1 |
