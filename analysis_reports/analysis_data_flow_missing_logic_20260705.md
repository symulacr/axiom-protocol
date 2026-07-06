# Data Flow & Missing Logic Analysis — Partition Scope (Sub-Agent 2)

**Agent**: Sub-Agent 2 — Data Flow & Missing Logic  
**Date**: 2026-07-05  
**Partition**: Backend bootstrap, env, provider, server wiring, route schemas, routers, WebSocket broadcaster  
**Files analyzed (13/13, line-by-line)**:

| File | Lines |
|------|-------|
| `apps/backend/src/index.ts` | 50 |
| `apps/backend/src/env.ts` | 1 |
| `apps/backend/src/env-schema.ts` | 35 |
| `apps/backend/src/provider.ts` | 16 |
| `apps/backend/src/server.ts` | 622 |
| `apps/backend/src/route-schemas.ts` | 80 |
| `apps/backend/src/routers/agents.ts` | 346 |
| `apps/backend/src/routers/events.ts` | 81 |
| `apps/backend/src/routers/health.ts` | 40 |
| `apps/backend/src/routers/orchestrator.ts` | 127 |
| `apps/backend/src/routers/performance.ts` | 143 |
| `apps/backend/src/routers/route-factory.ts` | 101 |
| `apps/backend/src/ws/broadcaster.ts` | 83 |

---

## 1. Executive Summary

This partition is the **HTTP/WebSocket entry layer** for the Axiom backend. Boot flow is: `index.ts` loads env → validates with Zod → initializes Sentry, provider, signer → calls `startServer()`. `server.ts` wires global middleware (request ID, logging, helmet, CORS, API key auth, rate limit), registers health/agents/events/performance/orchestrator/archive/payment routes, and mounts a topic-based WebSocket at `/v1/stream`.

**Overall data-flow posture**: Request → middleware → route handler → (optional Zod parse) → downstream service/oracle/on-chain call → JSON/SSE/WS response. Several flows are well-structured via `createRoute`, but **inconsistent validation**, **broken persistence on streaming paths**, and **dangling infrastructure** reduce reliability.

**Finding count**: **28 missing-logic / broken-flow issues**, **11 unwired/dangling items**, **12 positive patterns**, **14 microchange opportunities**.

**Highest-severity gaps** (within this partition):

1. **Streaming orchestrator ticks never persist to `EventStore`** — performance metrics and event history silently miss streamed runs.
2. **`paymentRouter` mounted after `Sentry.setupExpressErrorHandler`** — observability and error-middleware ordering is incorrect for ~6 payment/vault routes.
3. **WebSocket heartbeat evicts clients without `unregisterClient()`** — risks stale `_clientMap` entries and inconsistent client registry.
4. **`broadcast()` ignores topic subscriptions** — `orchestrator.tick` events leak to all connected WS clients.
5. **`storageRpc` env field threaded but never consumed** — configuration appears wired but has no effect.
6. **Several write/execute endpoints lack Zod schemas** — manual ad-hoc validation or none at all.

---

## 2. Partition Scope

### In scope (analyzed)

- Application bootstrap and graceful shutdown (`index.ts`)
- Environment loading/export surface (`env.ts`, `env-schema.ts`)
- Shared JSON-RPC provider singleton (`provider.ts`)
- Express server assembly, inline routes, WS upgrade (`server.ts`)
- Shared Zod request schemas (`route-schemas.ts`)
- Domain routers: agents, events, health, orchestrator, performance (`routers/*`)
- Route factory abstraction (`route-factory.ts`)
- WebSocket pub/sub primitives (`ws/broadcaster.ts`)

### Out of scope (referenced but not analyzed)

Downstream modules invoked by this partition: `events/store.js`, `orchestrator/index.js`, `oracle/client.js`, `payment/processor.js`, `compute/router.js`, `services/wayback.js`, `@axiom/config/*`. Findings here are limited to **how this partition calls** those modules, not their internal logic.

### Route registration map (`server.ts` → routers)

```
index.ts
  └─ startServer(config)
       ├─ middleware chain (json, requestId, log, helmet, cors, apiKey, rateLimit)
       ├─ createHealthRouter()           → GET /health
       ├─ inline                         → GET /v1/compute/providers
       ├─ inline                         → POST /v1/chat/completions (SSE)
       ├─ registerAgentRoutes()          → GET /v1/agents, POST /v1/agents/:id/transfer
       ├─ registerEventRoutes()          → POST/GET /v1/events
       ├─ registerPerformanceRoutes()    → GET /v1/agents/:id/performance, GET /v1/agents/performance/batch
       ├─ registerOrchestratorRoutes()   → POST /v1/orchestrator/tick
       ├─ archiveRouter (createRoute×4)  → /v1/archive/*
       ├─ paymentRouter (createRoute×5)  → /v1/agents/:id/earnings|royalty|metadata, /v1/payment/config, /v1/vaults/:id/execute
       ├─ Sentry error handler
       ├─ app.use(paymentRouter)         ← AFTER Sentry (ordering issue)
       ├─ global Zod/HTTP error handler
       └─ WS upgrade /v1/stream
```

---

## 3. Data Flow Maps

### 3.1 Bootstrap & Shutdown

```
process.env
  → loadEnv()                    [index.ts:13, env.ts:1]
  → backendEnvSchema.parse()     [index.ts:15, env-schema.ts:5-34]
  → Sentry.init (optional)       [index.ts:16-21]
  → getSharedProvider(chainId)   [index.ts:23, provider.ts:6-15]
  → Wallet(DEPLOYER_PK)          [index.ts:24]
  → resolveAddress×4 → addresses [index.ts:33-38]
  → startServer(config)          [index.ts:25-39, server.ts:83-621]
  → listen(bind, port)           [server.ts:613-616]

SIGTERM/SIGINT
  → getEventStore().flush()      [index.ts:43]
  → httpServer.close()           [index.ts:44-45]
```

**Gap**: `storageRpc` is passed into `ServerConfig` but never read inside `server.ts`.

---

### 3.2 Health Check — `GET /health`

```
Request
  → createHealthRouter           [server.ts:216-223]
  → Promise.all(
       provider.getBlockNumber(),  [health.ts:18-19]
       oracle.health()            [health.ts:19-20]
     )
  → 200 if chainHead > 0 else 503 [health.ts:22-30]
  → JSON { ok, version, signer, chainHead, oracle, addresses }
```

**Gap**: Oracle failure yields `"down"` but server can still return `ok: true` if chain head > 0. Address configuration is echoed but not validated on-chain.

---

### 3.3 Agent Listing — `GET /v1/agents?owner=0x…`

```
Request
  → manual owner regex check       [agents.ts:31-38]
  → 30s TTL cache per owner        [agents.ts:39-43]
  → provider.call(balanceOf)       [agents.ts:55-59]
  → provider.getLogs(Transfer, to=owner, fromBlock=0) [agents.ts:67-72]
  → for each log: ownerOf filter   [agents.ts:85-93]
  → intelligentDatasOf metadata    [agents.ts:95-120]
  → res.json({ owner, agents })
```

**Gap**: No route-factory/Zod; `fromBlock: 0` is unbounded; enumeration capped by `MAX_AGENT_ENUMERATION` (external constant) but balance may exceed cap silently.

---

### 3.4 Agent Transfer (Two-Phase) — `POST /v1/agents/:id/transfer`

```
Request body
  → transferBodySchema.parse()     [agents.ts:154, route-schemas.ts:12-21]
  → resolve dataHash (input or intelligentDatasOf) [agents.ts:156-173]
  → normalize receiverPubKey64     [agents.ts:175-180]

Challenge (no accessProof):
  ├─ rekey path (oldDataEncryptionKey + oldDataUri)
  │    → oracle.transferValidity() [agents.ts:187-216]
  └─ default path
       → oracle.signOwnership()    [agents.ts:234-255]

Finalize (accessProof present):
  → validate proof fields match body [agents.ts:263-270]
  → recoverAccessSigner(EIP-712)   [agents.ts:280-291]
  → oracle.signOwnership()         [agents.ts:308-340]
  → res.json stage:"final" with proofs
```

**Gap**: `:id` path param not validated as numeric before `BigInt(id)`; invalid IDs surface as 500 via global handler, not 400.

---

### 3.5 Event Ingestion & Query

#### `POST /v1/events` (indexer sink)

```
Request body
  → eventBodySchema.parse()        [events.ts:19, route-schemas.ts:31-39]
  → events.append({...})           [events.ts:25-34]
  → { stored }
```

**Gap**: No idempotency/dedup on `(chainId, txHash, logIndex)`; no auth beyond global API key.

#### `GET /v1/events`

```
Query params (manual parse)
  → limit (default DEFAULT_EVENT_LIMIT) [events.ts:48-55]
  → since, eventName                   [events.ts:56-65]
  → events.getAll(limit, since, eventName) [events.ts:65]
  → optional owner filter on payload fields [events.ts:66-76]
  → { events }
```

**Gap**: `limit` has no upper bound (unlike archive schemas' `max(500)`).

---

### 3.6 Orchestrator Tick — `POST /v1/orchestrator/tick`

```
Request body
  → tickSchema.parse()             [orchestrator.ts:25, route-schemas.ts:41-50]
  → build StrategySpec + MarketSignal [orchestrator.ts:38-52]
  → getOrCreateOrchestrator()      [orchestrator.ts:53-57, server.ts:152-170]

Non-streaming (stream !== true):
  → runner.runTick(spec, signal)   [orchestrator.ts:99]
  → events.append(Tick event)      [orchestrator.ts:100-116]
  → broadcast("orchestrator.tick") [orchestrator.ts:117-120]
  → res.json(orchestratorResult)

Streaming (stream === true):
  → check WS subscribers for tick.{id} [orchestrator.ts:59-74]
  → fire-and-forget runTick + sendToTopic chunks [orchestrator.ts:76-92]
  → res.status(202).json({ streamTopic })
```

**Gap**: Streaming branch **skips** `events.append` and uses topic-targeted WS only. `modelDataRoot` hardcoded to zero bytes32; `modelEncryption` always `undefined`.

---

### 3.7 Performance Metrics

#### `GET /v1/agents/:id/performance`

```
events.queryByAgent({ tokenId, eventName:"Tick", limit }) [performance.ts:30-34]
  → aggregate buy/sell/hold counts
  → build history from payload fields
  → winRate = buyCount / totalTicks        [performance.ts:75]
  → { metrics, history }
```

**Gap**: `winRate` is `buyCount/totalTicks`, not actual win/loss; depends on Tick events that streaming mode never writes.

#### `GET /v1/agents/performance/batch?ids=1,2,3`

```
Parse comma-separated numeric ids [performance.ts:92-96]
  → if ids.length > 50: return { error: "..." } with HTTP 200 [performance.ts:98-99]
  → per-id query + aggregate
  → { results }
```

---

### 3.8 Archive (Wayback) Routes

All four routes use `createRoute` + Zod schemas from `route-schemas.ts`:

| Route | Method | Schema | Handler |
|-------|--------|--------|---------|
| `/v1/archive/snapshots` | GET | `archiveLookupSchema` | `lookupSnapshots` |
| `/v1/archive/account` | POST | `archiveAccountSchema` | `lookupAccountTweets` |
| `/v1/archive/confirm` | POST | `archiveConfirmSchema` | `confirmArchived` |
| `/v1/archive/closest` | GET | `archiveClosestSchema` | `closestSnapshot` |

**Flow**: `createRoute` → `schema.parse(req.body ?? req.query)` → service call → `res.json(result)`.

**Gap**: `archiveClosestSchema.timestamp` is unvalidated free-form string.

---

### 3.9 Payment / Vault Routes (paymentRouter)

| Route | Validation | Downstream |
|-------|------------|------------|
| `GET /v1/agents/:id/earnings` | `requireId` only | on-chain `creatorOf` → `getPayment().earningsOf` |
| `POST /v1/agents/:id/royalty` | `royaltySchema` | `encodeSetRoyalty` |
| `GET /v1/payment/config` | none | cached `paymentToken/feeBps/treasury` |
| `POST /v1/vaults/:id/execute` | manual body check | **signs & sends** on-chain `vault.execute` |
| `POST /v1/agents/:id/metadata` | manual `datas` array check | ABI encode only (no broadcast) |

**Gap**: `execute` is a **state-mutating** server-signed transaction with no Zod schema; `getPayment()` throws if `paymentProcessor` address missing.

---

### 3.10 Compute Providers — `GET /v1/compute/providers`

```
getComputeBaseUrl()
  → fetch(router/models)           [server.ts:229-232]
  → zod parse { data: array }      [server.ts:234-236]
  → discoverProviders(evmRpc)      [server.ts:237]
  → merge model id → address map   [server.ts:238-256]
  → res.json({ services })
```

**Gap**: `resp.ok` not checked; non-JSON error bodies will throw in `resp.json()` or Zod parse.

---

### 3.11 Chat Completions (SSE) — `POST /v1/chat/completions`

```
chatBodySchema.parse(req.body)     [server.ts:268-272, route-schemas.ts:71-80]
  → resolveModel + createRouterClient [server.ts:273-274]
  → openai chat.completions.create(stream:true) [server.ts:275-281]
  → SSE write per chunk + [DONE]   [server.ts:282-289]
```

**Gap**: No client-disconnect handling; `tools: z.array(z.any())` accepts arbitrary payloads; always streams (no non-stream path).

---

### 3.12 WebSocket — `/v1/stream`

```
HTTP upgrade
  → pathname === /v1/stream        [server.ts:564-566]
  → optional ?token= API key       [server.ts:568-579]
  → MAX_WS_CLIENTS check           [server.ts:583-586]
  → topics from ?topic= (max 20)   [server.ts:588]
  → registerClient()               [server.ts:594, broadcaster.ts:38-44]
  → hello message                  [server.ts:598-604]
  → pong → missedPings = 0         [server.ts:595-597]
  → heartbeat ping every 30s       [server.ts:202-214]

Publish paths:
  → broadcast(topic, payload)      → ALL open clients (ignores topics)
  → sendToTopic(prefix, data)      → clients with matching topic subscription
```

---

## 4. Missing Logic Findings (with Evidence)

### F-01 — Streaming orchestrator ticks not persisted

**Severity**: High  
**Flow break**: `POST /v1/orchestrator/tick` (stream=true) → performance/history

**Evidence** (`routers/orchestrator.ts`):

Non-streaming path appends to event store:

```99:116:apps/backend/src/routers/orchestrator.ts
        const orchestratorResult = await runner.runTick(spec, signal);
        events.append({
          source: "orchestrator",
          eventName: "Tick",
          chainId,
          blockNumber: 0,
          txHash: "0x" + "0".repeat(64),
          logIndex: 0,
          payload: {
            tokenId: spec.agentTokenId.toString(),
            action: orchestratorResult.recommendation.action,
            // ...
          },
        });
```

Streaming path returns 202 and only WS-publishes — **no `events.append`**:

```76:96:apps/backend/src/routers/orchestrator.ts
          runner
            .runTick(spec, signal, (chunk) => {
              if (chunk.type === "token")
                sendToTopic(`tick.${agentTokenId}`, chunk);
            })
            .then((result) => {
              sendToTopic(`tick.${agentTokenId}`, {
                type: "complete",
                ...result,
              });
            })
            // ...
          res
            .status(202)
            .json({ ok: true, streamTopic: `tick.${agentTokenId}` });
```

**Impact**: `GET /v1/agents/:id/performance` queries `eventName: "Tick"` and will under-report metrics for streamed ticks.

---

### F-02 — `paymentRouter` registered after Sentry error handler

**Severity**: High (observability / middleware ordering)

**Evidence** (`server.ts`):

```526:528:apps/backend/src/server.ts
  Sentry.setupExpressErrorHandler(app);

  app.use(paymentRouter);
```

Payment routes (`/v1/agents/:id/earnings`, `/royalty`, `/metadata`, `/v1/payment/config`, `/v1/vaults/:id/execute`) are mounted **after** Sentry's Express error handler. Sentry docs recommend the error handler be one of the last middleware entries. Errors from these routes may not be captured consistently.

---

### F-03 — WebSocket heartbeat evicts without full unregister

**Severity**: Medium-High

**Evidence** (`server.ts`):

```206:209:apps/backend/src/server.ts
      if (c.missedPings >= MAX_MISSED_PINGS) {
        c.socket.terminate();
        wsClients.delete(c);
        continue;
```

Compare to `broadcaster.ts` `unregisterClient()` which also clears `_clientIds` and `_clientMap`:

```46:52:apps/backend/src/ws/broadcaster.ts
export function unregisterClient(client: ConnectedClient): void {
  _clients.delete(client);
  const id = _clientIds.get(client.socket);
  if (id) {
    _clientMap.delete(id);
    _clientIds.delete(client.socket);
  }
}
```

Heartbeat deletes from the client `Set` directly but **never calls `unregisterClient(c)`**, leaving `_clientMap` / `_clientIds` potentially stale until/unless a `close` event fires.

---

### F-04 — Non-OPEN WebSocket sockets never cleaned by heartbeat

**Severity**: Medium

**Evidence** (`server.ts`):

```204:205:apps/backend/src/server.ts
      if (c.socket.readyState !== c.socket.OPEN) continue;
```

Sockets in `CLOSING` or `CLOSED` state are skipped indefinitely. Cleanup relies solely on `close`/`error` handlers. If those do not fire, `_clients` retains dead entries.

---

### F-05 — `broadcast()` ignores topic subscriptions

**Severity**: Medium

**Evidence** (`ws/broadcaster.ts`):

```18:35:apps/backend/src/ws/broadcaster.ts
export function broadcast(topic: string, payload: unknown): void {
  const msg = JSON.stringify(
    { topic, payload, ts: Date.now() },
    bigintReplacer,
  );
  for (const c of _clients) {
    if (c.socket.readyState !== c.socket.OPEN) continue;
    if (c.socket.bufferedAmount > 65536) continue;
    try {
      c.socket.send(msg);
```

No check of `c.topics`. Used for orchestrator ticks:

```117:120:apps/backend/src/routers/orchestrator.ts
        broadcast("orchestrator.tick", {
          agentTokenId: spec.agentTokenId.toString(),
          recommendation: orchestratorResult.recommendation,
        });
```

**Impact**: All connected WS clients receive orchestrator tick events, not just subscribers of relevant topics.

---

### F-06 — `storageRpc` configured but never consumed

**Severity**: Medium

**Evidence**:

```29:30:apps/backend/src/index.ts
  evmRpc: env.AXIOM_EVM_RPC,
  storageRpc: env.AXIOM_STORAGE_RPC,
```

```68:69:apps/backend/src/server.ts
  evmRpc: string;
  storageRpc?: string;
```

`storageRpc` appears in `ServerConfig` but has **zero reads** anywhere in the partition. Env schema defines `AXIOM_STORAGE_RPC` (`env-schema.ts:9`) implying storage integration, but server logic never branches on it.

---

### F-07 — `paySchema` defined but no route uses it

**Severity**: Medium (missing payment-ingest endpoint)

**Evidence** (`route-schemas.ts`):

```23:25:apps/backend/src/route-schemas.ts
export const paySchema = z.object({
  amount: z.string().min(1),
});
```

No import or `createRoute` registration in any scoped file. Suggests a planned `POST …/pay` (or similar) route was never wired.

---

### F-08 — Vault execute: state-mutating endpoint without schema validation

**Severity**: Medium-High

**Evidence** (`server.ts`):

```462:474:apps/backend/src/server.ts
    async (_parsed, req, res, { id, config: cfg }) => {
      const vaultAddr = cfg.addresses?.vault;
      // ...
      const { target, value, data, proof } = req.body ?? {};
      if (!target || value === undefined || !data || !proof) {
        res.status(400).json({
          error: "Missing required fields (target, value, data, proof)",
        });
        return;
      }
```

Missing validation for: address format (`target`), numeric `value`, hex `data`, `proof` array element types, `id` numeric format. Server **signs and broadcasts** the transaction (`cfg.signer` at line 483).

---

### F-09 — Agent metadata encode: weak `datas` validation

**Severity**: Medium

**Evidence** (`server.ts`):

```511:514:apps/backend/src/server.ts
      const { datas } = req.body ?? {};
      if (!datas || !Array.isArray(datas)) {
        res.status(400).json({ error: "Missing or invalid datas array" });
        return;
      }
```

No schema for tuple shape expected by `update(uint256, datas)`. Empty array allowed; element types/uniqueness not checked.

---

### F-10 — Path param `:id` not validated as numeric token ID

**Severity**: Medium

**Evidence**:

`createRoute` `requireId` only checks presence:

```71:77:apps/backend/src/routers/route-factory.ts
        if (opts.requireId) {
          const idParam =
            typeof req.params.id === "string" ? req.params.id : null;
          if (!idParam) {
            res.status(400).json({ error: "Missing id" });
            return;
          }
        }
```

Used with `BigInt(id)` in earnings (`server.ts:390`), royalty (`server.ts:415`), vault execute (`server.ts:485`), metadata (`server.ts:518`). Non-numeric `id` (e.g. `"abc"`) throws → **500 Internal Server Error** instead of 400.

`tickSchema` correctly validates `agentTokenId` (`route-schemas.ts:44`), but agent/payment routes do not share that constraint.

---

### F-11 — `GET /v1/events` limit has no upper bound

**Severity**: Medium

**Evidence** (`routers/events.ts`):

```48:55:apps/backend/src/routers/events.ts
      const limit =
        limitRaw !== undefined && Number.isInteger(limitRaw) && limitRaw > 0
          ? limitRaw
          : DEFAULT_EVENT_LIMIT;
```

Contrast with archive schemas enforcing `.max(500)` (`route-schemas.ts:54,59`). A client can request extremely large limits → memory pressure in `EventStore.getAll`.

---

### F-12 — Event POST lacks idempotency / deduplication guard

**Severity**: Medium

**Evidence** (`routers/events.ts`):

```25:34:apps/backend/src/routers/events.ts
      const stored = events.append({
        source: b.source,
        eventName: b.eventName,
        chainId: b.chainId,
        blockNumber: b.blockNumber,
        txHash: b.txHash,
        logIndex: b.logIndex,
        payload: b.payload,
      });
```

No pre-check for duplicate `(chainId, txHash, logIndex)` at the router layer. Indexer retries would duplicate events, affecting performance aggregates.

---

### F-13 — `eventBodySchema` allows weakly typed on-chain fields

**Severity**: Low-Medium

**Evidence** (`route-schemas.ts`):

```31:39:apps/backend/src/route-schemas.ts
export const eventBodySchema = z.object({
  source: z.string().min(1),
  eventName: z.string().min(1),
  chainId: z.number(),
  blockNumber: z.number(),
  txHash: z.string().min(1),
  logIndex: z.number(),
  payload: z.record(z.string(), z.unknown()),
});
```

- `chainId` / `blockNumber` / `logIndex` allow negative numbers  
- `txHash` is any non-empty string, not `0x` + 64 hex  
- No constraint tying `chainId` to `config.env.AXIOM_CHAIN_ID`

---

### F-14 — Compute providers: no upstream HTTP status handling

**Severity**: Medium

**Evidence** (`server.ts`):

```229:236:apps/backend/src/server.ts
        const resp = await fetch(`${routerBaseUrl}/models`, {
          headers: { "X-Request-ID": res.locals.requestId as string },
        });
        const raw = await resp.json();
        const models = z
          .object({ data: z.array(z.record(z.string(), z.unknown())) })
          .parse(raw);
```

If compute router returns 502 HTML, `resp.json()` or Zod parse fails → opaque 500. No `if (!resp.ok)` branch, no structured upstream error mapping (unlike oracle regex at `server.ts:549-553`).

---

### F-15 — Chat SSE: no abort/disconnect handling

**Severity**: Medium

**Evidence** (`server.ts`):

```285:289:apps/backend/src/server.ts
        for await (const chunk of openaiRes) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        res.write("data: [DONE]\n\n");
        res.end();
```

If the HTTP client disconnects mid-stream, the `for await` loop continues consuming the upstream iterator. No `req.on('close')` abort signal, no try/finally guard.

---

### F-16 — Orchestrator `StrategySpec` uses placeholder on-chain data root

**Severity**: Medium

**Evidence** (`routers/orchestrator.ts`):

```38:47:apps/backend/src/routers/orchestrator.ts
        const spec: StrategySpec = {
          agentTokenId: BigInt(agentTokenId),
          agentNft,
          vault,
          computeModel: reqComputeModel ?? DEFAULT_MODEL,
          systemPrompt: "You are a crypto-native strategy assistant...",
          modelDataRoot: ("0x" + "0".repeat(64)) as `0x${string}`,
          modelEncryption: undefined,
        };
```

`agentNft` and `agentTokenId` are validated, but agent intelligent data is never loaded from chain. Any downstream logic expecting a real `modelDataRoot` receives zeros.

---

### F-17 — Performance `winRate` is not a win rate

**Severity**: Low-Medium (semantic bug)

**Evidence** (`routers/performance.ts`):

```68:76:apps/backend/src/routers/performance.ts
      const totalTicks = buyCount + sellCount + holdCount;
      return {
        metrics: {
          totalTicks,
          buyCount,
          sellCount,
          holdCount,
          winRate: totalTicks > 0 ? buyCount / totalTicks : 0,
        },
```

`winRate` = fraction of ticks that were **buy** actions, not profitable outcomes. Misleading metric exposed to `usePerformance` consumer.

---

### F-18 — Batch performance returns error object with HTTP 200

**Severity**: Low-Medium

**Evidence** (`routers/performance.ts`):

```97:99:apps/backend/src/routers/performance.ts
      if (ids.length === 0) return { results: {} };
      if (ids.length > 50)
        return { error: "Maximum 50 agents per batch request" };
```

`createRoute` always `res.json(result)` on success (`route-factory.ts:93-94`). Client receives HTTP 200 with `{ error: "..." }` — inconsistent with other routes using 400/503 status codes.

---

### F-19 — Agent listing: unbounded log scan from genesis

**Severity**: Medium (scalability)

**Evidence** (`routers/agents.ts`):

```67:72:apps/backend/src/routers/agents.ts
        const transferLogs = await provider.getLogs({
          address: nftAddr,
          fromBlock: 0,
          toBlock: "latest",
          topics: [TRANSFER_TOPIC, null, paddedOwner],
        });
```

No `fromBlock` cursor, no TTL on log scan, no use of ERC721 enumerable helpers. Grows with chain history.

---

### F-20 — Agent listing: silent truncation vs balance

**Severity**: Low-Medium

**Evidence** (`routers/agents.ts`):

```59:63:apps/backend/src/routers/agents.ts
        const balance = BigInt(balanceHex);
        if (balance === 0n) {
          res.json({ owner, agents: [] });
          return;
        }
```

```93:94:apps/backend/src/routers/agents.ts
          if (tokens.length >= MAX_AGENT_ENUMERATION) break;
```

If `balance > MAX_AGENT_ENUMERATION`, response returns partial `agents` with no `truncated: true` flag or total count.

---

### F-21 — Transfer challenge stage allows zero `accessProofNonce`

**Severity**: Low-Medium

**Evidence** (`routers/agents.ts`):

```185:185:apps/backend/src/routers/agents.ts
          const nonce = BigInt(accessProofNonce ?? 0);
```

Defaulting missing nonce to `0` may collide across repeated challenge requests; no server-side nonce generation or uniqueness enforcement.

---

### F-22 — `getSharedProvider(chainId)` only applies on first init

**Severity**: Low-Medium

**Evidence** (`provider.ts`):

```6:15:apps/backend/src/provider.ts
export function getSharedProvider(chainId?: number): JsonRpcProvider {
  if (!_provider) {
    const rpcUrl = resolveRpcUrl(chainId);
    // ...
    _provider = new JsonRpcProvider(fetchReq, undefined, {
      staticNetwork: true,
    });
  }
  return _provider;
}
```

`server.ts:172` calls `getSharedProvider()` without `chainId`. Safe when `index.ts` initializes first (`index.ts:23`), but fragile in tests/alternate entrypoints — first caller wins, later `chainId` ignored.

---

### F-23 — `createRoute` GET/POST schema source ambiguity

**Severity**: Low

**Evidence** (`routers/route-factory.ts`):

```85:87:apps/backend/src/routers/route-factory.ts
        const parsed = opts.schema
          ? opts.schema.parse(req.body ?? req.query)
          : undefined;
```

For POST routes, if `req.body` is `{}` (default after `express.json`), empty body routes fall through to `req.query`. Could unintentionally validate query params on POST endpoints (e.g. royalty POST accepting query string `bps`).

---

### F-24 — `getPayment()` failure becomes unhandled 500

**Severity**: Medium

**Evidence** (`server.ts`):

```180:183:apps/backend/src/server.ts
  async function getPayment(): Promise<PaymentProcessorClient> {
    if (payment) return payment;
    const addr = config.addresses?.paymentProcessor;
    if (!addr) throw new Error("PaymentProcessor address not configured");
```

Royalty/earnings/config routes call `getPayment()` without pre-checking `config.addresses?.paymentProcessor`. `createRoute`'s `requireAddress` helper exists but is **never used** in any registration. Error message won't match oracle/0g regex → generic 500.

---

### F-25 — Global error handler regex may misclassify errors

**Severity**: Low

**Evidence** (`server.ts`):

```548:553:apps/backend/src/server.ts
    const msg = err.message ?? "";
    if (/oracle|0g/i.test(msg)) {
      res
        .status(502)
        .json({ error: "Upstream service error", code: "UPSTREAM_ERROR" });
      return;
    }
```

Any error message containing `"0g"` (including unrelated strings) maps to 502. Broad regex-based classification.

---

### F-26 — Orchestrator init failure silently deferred

**Severity**: Low-Medium

**Evidence** (`server.ts`):

```152:169:apps/backend/src/server.ts
  function getOrCreateOrchestrator(): StrategyRunner | null {
    if (!orchestratorHandle) {
      try {
        orchestratorHandle = new StrategyRunner({...});
      } catch (err) {
        log.warn(
          `StrategyRunner init failed: ... — will retry on next tick`,
        );
      }
    }
    return orchestratorHandle;
  }
```

On failure, `orchestratorHandle` stays `null` but the function **does not retry** on subsequent calls because `!orchestratorHandle` is true but the catch leaves it null — actually wait, if init fails, orchestratorHandle stays null, so `!orchestratorHandle` is still true on next call. So it WILL retry. Good.

Actually on failure orchestratorHandle remains null, so next call tries again. That's OK.

But first tick gets 503 — acceptable. Not a bug - let me reconsider.

If constructor throws, orchestratorHandle is never set (still null). Next call: `if (!orchestratorHandle)` is true, retries. OK.

I'll downgrade this - the log says "will retry on next tick" and code does retry. Remove or reframe as positive/neutral.

Actually there's a subtle bug: if constructor succeeds partially? No, it's all or nothing.

Skip F-26 or note as informational only.

---

### F-26 — Streaming tick: HTTP 202 before work completes, no correlation ID

**Severity**: Low

**Evidence** (`routers/orchestrator.ts`):

```93:96:apps/backend/src/routers/orchestrator.ts
          res
            .status(202)
            .json({ ok: true, streamTopic: `tick.${agentTokenId}` });
```

Fire-and-forget async work with no job ID tying HTTP request to WS stream completion. Client cannot poll for status if WS drops.

---

### F-27 — Health check: oracle down does not affect `ok`

**Severity**: Low

**Evidence** (`routers/health.ts`):

```22:29:apps/backend/src/routers/health.ts
      const healthy = chainHead > 0;
      res.status(healthy ? 200 : 503).json({
        ok: healthy,
        // ...
        oracle: oracleHealth?.ok === true ? "up" : "down",
```

Oracle status is informational only; degraded dependency still returns HTTP 200.

---

### F-28 — `REGISTERED_ROUTES` populated but never served

**Severity**: Low

**Evidence** (`routers/route-factory.ts`):

```19:19:apps/backend/src/routers/route-factory.ts
export const REGISTERED_ROUTES: RouteRegistration[] = [];
```

```61:66:apps/backend/src/routers/route-factory.ts
  REGISTERED_ROUTES.push({
    method: method.toUpperCase() as "GET" | "POST",
    path: opts.path,
    consumer: opts.consumer,
    description: opts.description,
  });
```

Registry accumulates `consumer` metadata (e.g. `"useArchive"`, `"sink.ts"`) but no route in this partition exposes it. Frontend hook discovery is incomplete.

---

## 5. Unwired/Dangling Code Inventory

| Item | Location | Evidence | Status |
|------|----------|----------|--------|
| `paySchema` | `route-schemas.ts:23-25` | Exported, never imported in partition | **Dangling schema** |
| `getEnv`, `getEnvWithAlias` | `env.ts:1` | Re-exported; `index.ts` uses `backendEnvSchema.parse` directly | **Unused exports in partition** |
| `storageRpc` / `AXIOM_STORAGE_RPC` | `index.ts:30`, `server.ts:69`, `env-schema.ts:9` | Passed into config, never read | **Unwired config** |
| `REGISTERED_ROUTES` | `route-factory.ts:19-66` | Mutated on each `createRoute`, never read | **Write-only registry** |
| `RouteOptions.broadcast` | `route-factory.ts:41-42,90-91` | No `createRoute` call sets `broadcast` | **Unused option** |
| `RouteOptions.requireAddress` | `route-factory.ts:39-40,79-83` | Implemented, never passed in any registration | **Unused option** |
| `_clientMap` / `_clientIds` | `broadcaster.ts:15-16,41-51` | Written on register/unregister, never read | **Partially dangling maps** |
| `getClients()` mutable export | `broadcaster.ts:55-57` | Returns internal `Set` reference; `server.ts:208` mutates without unregister | **Leaky abstraction** |
| `ServerConfig.addresses.paymentProcessor` optional | `server.ts:76` | Earnings/royalty/config don't guard before `getPayment()` | **Config present but not enforced at route level** |
| `missedPings` on `ConnectedClient` | `broadcaster.ts:11` | Only used in `server.ts` heartbeat, not broadcaster | **Split responsibility** |
| `consumer` metadata strings | various `createRoute` calls | Document intended frontend hooks but no discovery endpoint | **Metadata-only wiring** |

---

## 6. Positive Findings

1. **Consistent boot-time Zod validation** — `backendEnvSchema.parse(process.env)` fails fast before server start (`index.ts:15`).

2. **Request ID propagation** — UUID per request, exposed as `x-request-id` and forwarded to compute router (`server.ts:90-95`, `231`).

3. **Structured access logging** — method, URL, status, duration on `finish` (`server.ts:97-104`).

4. **Defense-in-depth on HTTP** — helmet, CORS, API key auth, rate limiting (`server.ts:108-138`).

5. **Centralized Zod error handling** — `ZodError` → 400 with `details` (`server.ts:532-538`).

6. **Graceful shutdown** — SIGTERM/SIGINT flushes event store before exit (`index.ts:41-48`).

7. **`createRoute` abstraction** — standardizes try/catch, schema parse, `headersSent` guard (`route-factory.ts:67-99`).

8. **Two-phase transfer with cryptographic verification** — challenge/finalize split, EIP-712 `recoverAccessSigner`, field mismatch checks (`agents.ts:182-340`).

9. **Production guard on `sealedKey`** — rejects zero fallback in production (`agents.ts:225-228`, `299-302`).

10. **Caching where appropriate** — agent list 30s TTL (`agents.ts:24-25`), payment config 5min TTL (`server.ts:421-449`).

11. **WebSocket auth + capacity limits** — token query param, max 1000 clients, max 20 topics (`server.ts:568-588`).

12. **Non-streaming tick persistence + broadcast** — complete flow from orchestrator → event store → WS notification (`orchestrator.ts:99-121`).

---

## 7. Microchange Opportunities

| # | Change | Location | Effort | Impact |
|---|--------|----------|--------|--------|
| M-01 | Move `app.use(paymentRouter)` before `Sentry.setupExpressErrorHandler` | `server.ts:526-528` | Trivial | Fixes middleware ordering |
| M-02 | Call `unregisterClient(c)` in heartbeat eviction path | `server.ts:206-209` | Trivial | Prevents WS registry leaks |
| M-03 | Skip/remove dead WS entries when `readyState !== OPEN` | `server.ts:204-205` | Trivial | Cleaner client set |
| M-04 | Add `events.append` in streaming `.then((result) => …)` | `orchestrator.ts:81-86` | Small | Closes performance data gap |
| M-05 | Use `sendToTopic("orchestrator.tick", …)` instead of `broadcast` | `orchestrator.ts:117` | Trivial | Topic-scoped notifications |
| M-06 | Add `requireAddress: "paymentProcessor"` on payment routes | `server.ts` createRoute opts | Trivial | Clear 500 → configured 500 message |
| M-07 | Validate `:id` with `/^\d+$/` in `createRoute` when `requireId` | `route-factory.ts:71-77` | Small | 400 instead of 500 on bad IDs |
| M-08 | Cap `GET /v1/events` limit at 500 | `events.ts:52-55` | Trivial | Prevents memory abuse |
| M-09 | Return `res.status(400)` for batch >50 ids | `performance.ts:98-99` | Trivial | Consistent error semantics |
| M-10 | Check `resp.ok` before JSON parse on compute providers | `server.ts:229-233` | Trivial | Better upstream errors |
| M-11 | Wire `paySchema` to a route or remove export | `route-schemas.ts:23-25` | Small | Eliminate dangling API contract |
| M-12 | Expose `GET /v1/routes` reading `REGISTERED_ROUTES` | new route in `server.ts` | Small | Frontend discovery |
| M-13 | Add `truncated: true` when enumeration hits cap | `agents.ts:93-94` | Trivial | Client-visible completeness signal |
| M-14 | Parse `vaultExecuteSchema` for execute endpoint | `server.ts:462-474` | Medium | Safer state-mutating route |

---

## Appendix: File-by-File Quick Reference

| File | Role in data flow | Key gaps |
|------|-------------------|----------|
| `index.ts` | Boot, shutdown, address resolution | Passes unused `storageRpc` |
| `env.ts` | Re-export env helpers | `getEnv*` unused in boot path |
| `env-schema.ts` | Zod env contract | `AXIOM_STORAGE_RPC` unused downstream |
| `provider.ts` | RPC singleton | First-call chainId pinning |
| `server.ts` | Main wiring | Payment router order, inline route validation gaps |
| `route-schemas.ts` | Request contracts | `paySchema` unused; weak event schema |
| `agents.ts` | Agent list + transfer | Log scan scale; id validation |
| `events.ts` | Event sink + query | No dedup; unbounded limit |
| `health.ts` | Liveness | Oracle not part of `ok` |
| `orchestrator.ts` | Strategy ticks | Streaming persistence gap; zero data root |
| `performance.ts` | Metrics aggregation | Misleading winRate; 200 on error |
| `route-factory.ts` | Route helper | Unused `broadcast`, `requireAddress`; registry not exposed |
| `broadcaster.ts` | WS pub/sub | `broadcast` ignores topics; stale maps |

---

*End of report. No fixes implemented per analysis-only mandate.*