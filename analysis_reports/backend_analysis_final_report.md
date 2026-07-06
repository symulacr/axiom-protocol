# Backend Analysis — Final Consolidated Report

**Main Agent:** Consolidation  
**Date:** 2026-07-05  
**Scope:** `apps/backend/` only (29 source files, ~4,571 LOC)  
**Sub-agent reports:**
- `analysis_duplication_patterns_20260705.md` (Sub-Agent 1)
- `analysis_data_flow_missing_logic_20260705.md` (Sub-Agent 2)
- `analysis_quality_types_architecture_20260705.md` (Sub-Agent 3)

**Status:** Analysis + planning only — no fixes implemented.

---

## 1. Partition Plan (Non-Overlapping)

The backend was divided into three balanced groups with **zero file overlap**:

### Group A — Core Services & Integrations (~1,505 LOC)
*Sub-Agent 1: Duplication & Pattern*

| File | Lines |
|------|-------|
| `src/compute/broker.ts` | 157 |
| `src/compute/provider-discovery.ts` | 72 |
| `src/compute/router.ts` | 171 |
| `src/compute/tee-verifier.ts` | 55 |
| `src/orchestrator/index.ts` | 445 |
| `src/orchestrator/orchestrator-chainid.test.ts` | 93 |
| `src/oracle/client.ts` | 147 |
| `src/payment/processor.ts` | 233 |
| `src/services/wayback.ts` | 132 |

### Group B — API Layer, Routing & Server Shell (~1,650 LOC)
*Sub-Agent 2: Data Flow & Missing Logic*

| File | Lines |
|------|-------|
| `src/index.ts` | 49 |
| `src/env.ts` | 1 |
| `src/env-schema.ts` | 35 |
| `src/provider.ts` | 16 |
| `src/server.ts` | 622 |
| `src/route-schemas.ts` | 80 |
| `src/routers/agents.ts` | 346 |
| `src/routers/events.ts` | 81 |
| `src/routers/health.ts` | 40 |
| `src/routers/orchestrator.ts` | 127 |
| `src/routers/performance.ts` | 143 |
| `src/routers/route-factory.ts` | 101 |
| `src/ws/broadcaster.ts` | 83 |

### Group C — State, Events, Utils & Tooling (~1,416 LOC)
*Sub-Agent 3: Quality, Types & Architecture*

| File | Lines |
|------|-------|
| `src/events/store.ts` | 322 |
| `src/events/payloads.ts` | 74 |
| `src/utils/logger.ts` | 35 |
| `src/utils/constants.ts` | 12 |
| `src/utils/response.ts` | 13 |
| `src/cli/run-e2e.ts` | 518 |
| `src/server/transfer.test.ts` | 368 |

---

## 2. Overall Backend Health Summary

| Dimension | Grade | Summary |
|-----------|-------|---------|
| **Architecture** | B− | Clear layering (compute → orchestrator → routers → server), but cross-cutting concerns (provider discovery, chain-id resolution, event typing) are fragmented across modules. |
| **Data integrity** | C+ | EventStore has silent corruption handling and debounced-persist data-loss windows; streaming ticks skip persistence; no event dedup on ingest. |
| **Type safety** | B | No explicit `any` in backend; boundaries rely on `as T` casts, `Record<string, unknown>`, and orphaned `payloads.ts` types. |
| **Duplication** | C | 28 duplication findings in compute/orchestrator partition alone; provider discovery reimplemented 4×; Wayback CDX pipeline copy-pasted. |
| **API completeness** | B− | Core flows (transfer, tick, events, health) wired; `paySchema` dangling, `storageRpc` unwired, `REGISTERED_ROUTES` write-only. |
| **Observability** | B | Structured logging, request IDs, Sentry — but payment router mounted after Sentry error handler; two logger modules share `"compute"` label. |
| **Test coverage** | B | Transfer integration tests are strong; E2E CLI is monolithic; orchestrator chainId tests are focused but narrow. |

**Total findings across sub-agents:** ~98 distinct issues (28 duplication + 28 data-flow + 42 quality/types), with significant overlap in theme but distinct evidence per partition.

---

## 3. System-Wide Cross-Cutting Patterns

These issues span multiple partitions and represent the highest architectural debt:

### X-01: Provider Discovery Fragmentation (Groups A + B)

**Evidence chain:**
- `provider-discovery.ts:40-47` — cached `listService()` with 5-min TTL
- `router.ts:73-76, 163-167` — direct `getReadOnlyBroker` + `listService()`, `services[0]` fallback
- `orchestrator/index.ts:281-283` — inline discovery bypassing cache, `services[0]?.provider` for TEE
- `server.ts:237` — `discoverProviders(evmRpc)` on compute providers endpoint

**Problem:** The same on-chain query is implemented four ways with different caching, selection, and null-handling. TEE verification may target provider A while inference routes to provider B.

**Microchange:** Single `listServicesCached(chainId, rpcUrl)` + `selectProvider(services, context)` with documented policy.

---

### X-02: Event Pipeline Integrity Gap (Groups B + C)

**Evidence chain:**
- `orchestrator.ts:76-96` — streaming path skips `events.append()`
- `orchestrator.ts:99-116` — non-streaming path appends Tick events
- `performance.ts:30-34` — metrics query `eventName: "Tick"`
- `store.ts:268-271` — 2s debounced persist; crash window loses events
- `store.ts:195-214` — corrupt file → silent full discard

**Problem:** Performance metrics under-report streamed ticks; persisted events can be lost on crash; corrupt disk state is silently reset.

**Microchange:** Append Tick events in streaming `.then()`; atomic persist writes; log corruption; wire `flush()` on shutdown (partially done in `index.ts:43`).

---

### X-03: Type System Disconnect (Groups B + C)

**Evidence chain:**
- `payloads.ts:3-51` — typed `TickPayload`, `TransferPayload`, etc.
- `store.ts:24` — `payload: Record<string, unknown>`
- `events.ts:25-34` — append accepts `z.record(z.string(), z.unknown())`
- `performance.ts:68-76` — manual field extraction from opaque payload

**Problem:** Typed payload work exists but is not wired into store, routers, or queries. Type safety ends at Zod ingress; everything downstream is opaque.

**Microchange:** Bridge `EventPayload` discriminated union into `StoredEvent`; use `payloads.ts` extractors in performance router.

---

### X-04: Chain-ID / RPC Configuration Drift (Groups A + B)

**Evidence chain:**
- `broker.ts:34-37` — `resolveChainId(arg → AXIOM_CHAIN_ID env → GALILEO)`
- `orchestrator/index.ts:86` — `config.chainId ?? GALILEO_CHAIN_ID` (no env fallback)
- `provider.ts:6-15` — singleton pins RPC on first call, ignores later `chainId`
- `index.ts:23` — initializes provider with `env.AXIOM_CHAIN_ID ?? GALILEO_CHAIN_ID`

**Problem:** Orchestrator, compute broker, and shared provider can disagree on chain identity depending on which config path is used.

**Microchange:** Orchestrator uses `resolveChainId(config.chainId)`; document provider singleton init order.

---

### X-05: HTTP Boundary Validation Gaps (Groups B + C)

**Evidence chain:**
- `run-e2e.ts:131-137` — `as T` on fetch JSON without `response.ok`
- `transfer.test.ts:110-117` — same pattern in tests
- `server.ts:462-474` — vault execute: manual body check, no Zod
- `server.ts:229-236` — compute providers: no `resp.ok` check
- `route-factory.ts:71-77` — `requireId` checks presence, not numeric format

**Problem:** Invalid input and upstream errors surface as 500s or silent mis-parsing instead of structured 400/502 responses.

**Microchange:** Shared `fetchJson<T>(url, schema)` helper; `tokenIdParamSchema`; `vaultExecuteSchema`.

---

### X-06: WebSocket Registry Inconsistency (Group B internal)

**Evidence chain:**
- `server.ts:206-209` — heartbeat `terminate()` + `wsClients.delete(c)` only
- `broadcaster.ts:46-52` — `unregisterClient()` clears `_clientMap` + `_clientIds`
- `broadcaster.ts:18-35` — `broadcast()` sends to ALL clients, ignores `c.topics`
- `orchestrator.ts:117-120` — uses `broadcast("orchestrator.tick", …)` not `sendToTopic`

**Problem:** Client registry can desync; topic subscriptions are ineffective for orchestrator events.

**Microchange:** Heartbeat calls `unregisterClient(c)`; replace `broadcast` with `sendToTopic` for tick events.

---

## 4. All Findings by Severity

### Critical (3)

| ID | Issue | Location | Sub-Agent | Evidence |
|----|-------|----------|-----------|----------|
| C-1 | Silent discard of corrupt persisted events | `store.ts:195-214` | SA3 | `catch {}` on `load()` — no logging, full data loss |
| C-2 | `readonly` query returns expose mutable internal arrays | `store.ts:102-106, 111-124` | SA3 | `return bucket` — same reference as store indexes |
| C-3 | Debounced persist window loses events on crash | `store.ts:268-271` | SA3 | 2s debounce; SIGKILL before flush drops events |

---

### High (18)

| ID | Issue | Location | Sub-Agent |
|----|-------|----------|-----------|
| H-1 | Streaming orchestrator ticks not persisted | `orchestrator.ts:76-96` vs `99-116` | SA2 (F-01) |
| H-2 | `paymentRouter` mounted after Sentry error handler | `server.ts:526-528` | SA2 (F-02) |
| H-3 | TEE verification uses `services[0]` bypassing cached discovery | `orchestrator/index.ts:281-283` | SA1 (F-08) |
| H-4 | Provider `services[0]` fallback in router vs address-matched selection | `router.ts:165-167` vs `77-79` | SA1 (F-27) |
| H-5 | Chain-id resolution split (orchestrator vs broker env) | `orchestrator/index.ts:86` vs `broker.ts:34-37` | SA1 (F-23) |
| H-6 | `JSON.parse` + unchecked assertion on disk load | `store.ts:198-199` | SA3 (H-1) |
| H-7 | `structuredClone` on every append | `store.ts:79-80` | SA3 (H-2) |
| H-8 | O(n) index removal on eviction | `store.ts:235-248` | SA3 (H-3) |
| H-9 | `getAll()` full materialization + sort | `store.ts:137-145` | SA3 (H-4) |
| H-10 | `getTokenIdsByOwner` full-table scan | `store.ts:153-175` | SA3 (H-5) |
| H-11 | `payloads.ts` disconnected from `EventStore` | `payloads.ts` vs `store.ts:24` | SA3 (H-6) |
| H-12 | `EventPayload` union escape hatch breaks exhaustiveness | `payloads.ts:51` | SA3 (H-7) |
| H-13 | E2E `main()` god-function (~413 lines) | `run-e2e.ts:103-516` | SA3 (H-8) |
| H-14 | HTTP `as T` without status/schema validation | `run-e2e.ts:131-137`, `transfer.test.ts` | SA3 (H-9) |
| H-15 | Vault execute: state-mutating, no Zod schema | `server.ts:462-474` | SA2 (F-08) |
| H-16 | Wayback CDX fetch block exact duplicate | `wayback.ts:50-55` vs `74-79` | SA1 (F-01) |
| H-17 | `JsonRpcProvider` construction 3 variants | `broker.ts`, `router.ts`, `orchestrator/index.ts` | SA1 (F-11) |
| H-18 | WS heartbeat evicts without `unregisterClient()` | `server.ts:206-209` | SA2 (F-03) |

---

### Medium (36+)

Representative medium-severity findings (full detail in sub-agent reports):

| Theme | Key Locations | Sub-Agent |
|-------|---------------|-----------|
| WS `broadcast()` ignores topic subscriptions | `broadcaster.ts:18-35`, `orchestrator.ts:117` | SA2 (F-05) |
| `storageRpc` threaded but never consumed | `index.ts:30`, `server.ts:69` | SA2 (F-06) |
| `paySchema` defined, no route wired | `route-schemas.ts:23-25` | SA2 (F-07) |
| Event POST lacks idempotency | `events.ts:25-34` | SA2 (F-12) |
| `GET /v1/events` limit unbounded | `events.ts:48-55` | SA2 (F-11) |
| Orchestrator zero `modelDataRoot` placeholder | `orchestrator.ts:38-47` | SA2 (F-16) |
| Agent listing unbounded `fromBlock: 0` scan | `agents.ts:67-72` | SA2 (F-19) |
| Chat SSE no client-disconnect abort | `server.ts:285-289` | SA2 (F-15) |
| Compute providers no `resp.ok` check | `server.ts:229-236` | SA2 (F-14) |
| Performance `winRate` = buyCount/totalTicks | `performance.ts:75` | SA2 (F-17) |
| Oracle HTTP `get`/`post` near-duplicates | `oracle/client.ts:120-145` | SA1 (F-10) |
| Payment event-log parsing duplicated | `processor.ts:135-145, 207-214` | SA1 (F-09) |
| Two-layer provider caching overlap | `broker.ts` + `provider-discovery.ts` | SA1 (F-14) |
| `clear()` doesn't sync disk | `store.ts:283-288` | SA3 (M-1) |
| `persist()` sync blocking I/O | `store.ts:255-260` | SA3 (M-4) |
| E2E module-level side effects | `run-e2e.ts:29-79` | SA3 (M-9) |

---

### Low / Cosmetic (16+)

Includes: unused `GALILEO_CHAIN_ID` import in router (SA1 F-26), stale `main()` line-count comment (SA3 CO-1), `REGISTERED_ROUTES` write-only (SA2 F-28), `DEFAULT_EVENT_LIMIT` unused in store (SA3 L-11), health oracle down still returns `ok: true` (SA2 F-27), logger name collision `"compute"` (SA1 F-19), and others per sub-agent appendices.

---

## 5. Positive Findings (Well-Structured Areas)

1. **`broker.ts` as centralized SDK factory** — explicit comment and exports prevent scattered `@0gfoundation/0g-compute-ts-sdk` imports (SA1).
2. **`provider-discovery.ts` in-flight promise dedup** — correct thundering-herd prevention (SA1).
3. **`createRoute` abstraction** — standardized try/catch, Zod parse, `headersSent` guard (SA2).
4. **Two-phase transfer with EIP-712 verification** — challenge/finalize, `recoverAccessSigner`, production `sealedKey` guards (SA2).
5. **Boot-time Zod env validation** — `backendEnvSchema.parse(process.env)` fails fast (SA2).
6. **Graceful shutdown** — SIGTERM/SIGINT flushes event store (`index.ts:43`) (SA2 + SA3).
7. **Request ID propagation** — UUID per request, forwarded to compute router (SA2).
8. **`payment/processor.ts` `ensureAllowance`** — approval pre-flight extracted once (SA1).
9. **`transfer.test.ts` integration coverage** — challenge, final, and re-key paths with real HTTP servers (SA3).
10. **`tee-verifier.ts` thin wrapper** — single responsibility, delegates to broker (SA1).
11. **Multi-index EventStore design** — thoughtful for agent event polling (SA3).
12. **`postStep<T>` E2E abstraction** — DRY HTTP steps with typed summaries (SA3).

---

## 6. Microchange Plan

### Phase 0 — Production Safety (Do First)

| # | Change | Files | Effort | Before → After |
|---|--------|-------|--------|----------------|
| P0-1 | Log + quarantine corrupt persist file; atomic write-temp-rename | `store.ts` | S | **Before:** `catch {}` silently resets. **After:** `log.warn`, rename to `.bak`, start fresh with audit trail. |
| P0-2 | Defensive copy on `queryBySource`/`queryByAgent` returns | `store.ts` | S | **Before:** `return bucket` (mutable leak). **After:** `return [...bucket]` or `Object.freeze([...bucket])`. |
| P0-3 | Append Tick event in streaming `.then()` | `orchestrator.ts:81-86` | S | **Before:** streamed ticks invisible to performance API. **After:** same `events.append()` as non-stream path. |
| P0-4 | Move `app.use(paymentRouter)` before Sentry error handler | `server.ts:526-528` | S | **Before:** payment route errors may skip Sentry. **After:** all routes behind consistent error capture. |
| P0-5 | Heartbeat calls `unregisterClient(c)` on eviction | `server.ts:206-209` | S | **Before:** `_clientMap` stale. **After:** full registry cleanup on terminate. |
| P0-6 | Orchestrator uses `resolveChainId(config.chainId)` | `orchestrator/index.ts:86` | S | **Before:** ignores `AXIOM_CHAIN_ID` env when config omits chainId. **After:** same precedence as compute stack. |
| P0-7 | Unify provider discovery; eliminate `services[0]` hacks | `provider-discovery.ts`, `router.ts`, `orchestrator/index.ts` | M | **Before:** 4 implementations, TEE/inference mismatch risk. **After:** single cached `listServices()` + `selectProvider(ctx)`. |

### Phase 1 — Data Integrity & API Correctness

| # | Change | Files | Effort |
|---|--------|-------|--------|
| P1-1 | Runtime schema validation on `store.load()` | `store.ts` | M |
| P1-2 | Event dedup on `(chainId, txHash, logIndex)` at ingest | `events.ts` | S |
| P1-3 | Cap `GET /v1/events` limit at 500 | `events.ts` | S |
| P1-4 | Validate `:id` as `/^\d+$/` in `createRoute` when `requireId` | `route-factory.ts` | S |
| P1-5 | Add `vaultExecuteSchema` for execute endpoint | `route-schemas.ts`, `server.ts` | M |
| P1-6 | Check `resp.ok` on compute providers + chat upstream | `server.ts` | S |
| P1-7 | Replace `broadcast` with `sendToTopic` for orchestrator ticks | `orchestrator.ts`, `broadcaster.ts` | S |
| P1-8 | Wire `paySchema` to route or remove export | `route-schemas.ts`, `server.ts` | S |
| P1-9 | Return HTTP 400 (not 200) for batch performance >50 ids | `performance.ts` | S |
| P1-10 | Connect `EventPayload` types to `StoredEvent` | `store.ts`, `payloads.ts` | L |

### Phase 2 — Duplication Reduction

| # | Change | Files | Effort |
|---|--------|-------|--------|
| P2-1 | Extract `fetchCdxRows` + `waybackTimestampToIso` | `wayback.ts` | S |
| P2-2 | Shared `createStaticProvider(rpc, chainId, opts?)` | `broker.ts`, `router.ts`, `orchestrator/index.ts` | M |
| P2-3 | `findParsedEvent` + `sendAndWait` in payment processor | `processor.ts` | S |
| P2-4 | Oracle `request<T>(method, path, body?)` | `oracle/client.ts` | S |
| P2-5 | `buildOpenAIClient(baseURL, apiKey, timeout)` | `router.ts` | S |
| P2-6 | Constants: `ZERO_DATA_ROOT`, `EMPTY_ONCHAIN` | `orchestrator/index.ts`, `utils/constants.ts` | S |
| P2-7 | Distinct logger names (`compute-router`, `provider-discovery`) | `router.ts`, `provider-discovery.ts` | S |
| P2-8 | Lazy vault `TypedContract` on `StrategyRunner` | `orchestrator/index.ts` | S |

### Phase 3 — Performance & Architecture

| # | Change | Files | Effort |
|---|--------|-------|--------|
| P3-1 | O(1) index removal or lazy rebuild on eviction | `store.ts` | M |
| P3-2 | Owner index for `getTokenIdsByOwner` | `store.ts` | M |
| P3-3 | Revisit `structuredClone` necessity on append | `store.ts` | S |
| P3-4 | Async persist with temp-rename | `store.ts` | M |
| P3-5 | Extract E2E step modules from `main()` | `run-e2e.ts` | L |
| P3-6 | Split `EventStore` into index + persist layers | `store.ts` | L |
| P3-7 | Shared `fetchJson<T>` with Zod validation | new util, `run-e2e.ts` | M |
| P3-8 | Expose `GET /v1/routes` from `REGISTERED_ROUTES` | `server.ts` | S |

**Effort key:** S = <1h, M = half-day, L = 1+ days

---

## 7. Before/After — Highest-Impact Microchanges

### 7.1 Provider Discovery Unification (P0-7)

**Before** (`orchestrator/index.ts:281-283`):
```typescript
const broker = await getReadOnlyBroker(this.evmRpc, this.chainId);
const services = await broker.listService();
providerAddress = services[0]?.provider;
```

**After** (conceptual):
```typescript
const services = await listServicesCached(this.evmRpc, this.chainId);
providerAddress = selectProvider(services, {
  model: strategy.computeModel,
  mode: "tee-verify",
})?.provider;
```

**Impact:** Eliminates provider A/B mismatch between inference and TEE verification; reduces redundant RPC calls via shared cache.

---

### 7.2 Streaming Tick Persistence (P0-3)

**Before** (`orchestrator.ts:81-86`):
```typescript
.then((result) => {
  sendToTopic(`tick.${agentTokenId}`, { type: "complete", ...result });
})
```

**After** (conceptual):
```typescript
.then((result) => {
  events.append({ source: "orchestrator", eventName: "Tick", /* same fields as non-stream */ });
  sendToTopic(`tick.${agentTokenId}`, { type: "complete", ...result });
})
```

**Impact:** `GET /v1/agents/:id/performance` returns accurate metrics regardless of streaming mode.

---

### 7.3 EventStore Corrupt Load Handling (P0-1)

**Before** (`store.ts:195-214`):
```typescript
} catch {
  // File missing or corrupt — start fresh.
}
```

**After** (conceptual):
```typescript
} catch (err) {
  log.warn("persist file corrupt, starting fresh", { error: extractErrorMessage(err) });
  if (existsSync(PERSIST_FILE)) renameSync(PERSIST_FILE, `${PERSIST_FILE}.bak`);
}
```

**Impact:** Ops can diagnose data loss; corrupt files preserved for forensics.

---

### 7.4 Vault Execute Validation (P1-5)

**Before** (`server.ts:462-474`):
```typescript
const { target, value, data, proof } = req.body ?? {};
if (!target || value === undefined || !data || !proof) {
  res.status(400).json({ error: "Missing required fields..." });
}
```

**After** (conceptual):
```typescript
const body = vaultExecuteSchema.parse(req.body);
// target: z.string().regex(/^0x[a-fA-F0-9]{40}$/)
// value: z.string().regex(/^\d+$/) → BigInt
// data: z.string().regex(/^0x[a-fA-F0-9]*$/)
// proof: z.array(z.string().regex(/^0x/))
```

**Impact:** Server-signed on-chain transactions reject malformed input at 400 instead of broadcasting failing txs.

---

## 8. Prioritization Matrix

```
                    IMPACT
                    High ──────────────────────────►
              ┌─────┬─────────────────────────────┐
         High │ P0-7│ P0-1, P0-3, P0-4, P0-6     │
              │     │ P1-5, P1-10                 │
    EFFORT    ├─────┼─────────────────────────────┤
         Low  │ P0-2│ P0-5, P1-1..P1-9, P2-*     │
              │ P2-7│ P3-8                        │
              └─────┴─────────────────────────────┘
```

**Recommended execution order:**
1. Phase 0 (P0-1 through P0-7) — production safety and cross-cutting correctness
2. Phase 1 (P1-1 through P1-10) — API contracts and data integrity
3. Phase 2 (P2-1 through P2-8) — duplication reduction (low risk, high maintainability ROI)
4. Phase 3 (P3-1 through P3-8) — performance and structural refactors (schedule when load warrants)

---

## 9. Sub-Agent Report Index

| Report | Agent | Findings | Key Themes |
|--------|-------|----------|------------|
| `analysis_duplication_patterns_20260705.md` | SA1 | 28 | Provider discovery 4×, Wayback copy-paste, JsonRpcProvider variants, event-log parsing |
| `analysis_data_flow_missing_logic_20260705.md` | SA2 | 28 + 11 dangling | Streaming persistence gap, Sentry ordering, WS registry, unwired config/schemas |
| `analysis_quality_types_architecture_20260705.md` | SA3 | 42 | EventStore god-class, corrupt load, mutable leaks, orphaned payloads, E2E monolith |

---

## 10. Conclusion

The Axiom backend is **functionally complete** for its core protocol flows (mint metadata registration, orchestrator ticks, two-phase transfers, event ingestion, compute routing). The architecture follows sensible layering with a shared config package and route-factory abstraction.

The primary risks are **not missing features** but **consistency gaps**: provider selection diverges across modules, event persistence has integrity holes, and the type system stops at API ingress. These are addressable through the phased microchange plan above without large rewrites.

**No fixes were implemented in this analysis phase.** Ready for implementation on request, starting with Phase 0.

---

*End of consolidated report.*