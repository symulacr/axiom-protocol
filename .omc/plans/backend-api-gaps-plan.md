# Backend API Gaps + Route Consolidation — Fix Analysis

> 4-lens analysis per finding: smaller delta, more elegant, what's architecturally wrong, what's overengineered.

---

## Finding 1: 4–5 Dead Backend Routes

Dead routes (no frontend code references them): `GET /v1/agents/:id/history`, `POST /v1/vaults/:id/deposit`, `POST /v1/vaults/:id/strategy`, `POST /v1/compute/pay` (hook `payComputeProvider` exists in `usePayment` but is never called by any component). `GET /v1/agents/:id/events` is deprecated and also orphaned.

**Smaller delta** — Remove the 4 truly dead routes + the duplicate deprecated `:id/events` router handler. Delete the `routeRouter` block (`/v1/vaults/:id/deposit`, `/v1/vaults/:id/strategy`, `/v1/compute/pay`) and the orphaned `/v1/agents/:id/history` handler. Remove `payComputeProvider` from the `usePayment` hook (function + return value). Net: ~50 LOC removed, no behavioral change, immediately lower maintenance surface.

**More elegant** — A route registry with an `enabled` flag per route and a `GET /v1/routes` introspection endpoint. Dead routes are marked `enabled: false` at the schema level and automatically omitted from the Express router. The frontend fetches `/v1/routes` on boot to discover which features are available and can hide UI elements accordingly.

**Not architecturally coherent** — Routes are registered ad-hoc across 4 different patterns: bare `app.get/post`, `createRoute()` helper, `Router().use()` block, and `app.use(paymentRouter)`. There is no inventory or manifest. Dead routes silently accumulate because nothing fails when they're unreferenced — they just consume resources (memory for closures, port space for nothing).

**Overengineered** — An OpenAPI/Swagger schema + auto-generated client. This is a 4-person team; the overhead of spec-first development would outweigh the benefit. A code-level manifest is sufficient.

**Recommendation** — Delete the dead code. 30-minute task, 4 files changed:
- `apps/backend/src/server.ts`: remove `routeRouter` block (vaults + compute/pay), remove `GET /v1/agents/:id/history`, remove deprecated `GET /v1/agents/:id/events`
- `apps/frontend/src/hooks/usePayment.ts`: remove `payComputeProvider` (function + return type + export)

---

## Finding 2: `GET /v1/events` O(n) Bottleneck

Both MarketPage (30s poll) and HistoryPage (15s poll) call `events.getAll()` which concatenates **every bucket** into one array, then filters in-memory by `eventName` and `owner`. With N events across M buckets: O(N+M) allocation on every poll.

**Smaller delta** — Add two index maps to `EventStore`: `byEventName: Map<string, StoredEvent[]>` and `byTokenId: Map<string, StoredEvent[]>` in `append()`. The `getAll(eventName)` and `queryByAgent()` methods use these maps instead of scanning all buckets. Also add a bounded tail-cache for the last 200 "all events" entries so the MarketPage transfer poll is near-instant (~200 object scan vs. thousands). ~50 LOC added, O(N) → O(1) per query.

**More elegant** — Replace the in-memory `EventStore` with SQLite (via `better-sqlite3`). Indexes on `(eventName, timestamp)` and `(payload->>tokenId)`. No serialization overhead, no crash-loss of events (the current JSON persist file is single-threaded and can corrupt under concurrent writes), and queries are declarative. The `EventStore` interface stays the same; the implementation swaps.

**Not architecturally coherent** — The event store is an append-only log but queries it like a relational store (scan + filter). The `getAll()` method is defined as "return everything" when the callers only ever want a subset. This is a **leaky abstraction**: the storage internals (buckets keyed by `source::eventName`) leak into query performance. Callers pay O(N+M) even when they need 20 events.

**Overengineered** — PostgreSQL or Redis. This is a frontend-polling event stream; the volume is tiny (1000 events per source). SQLite is perfectly adequate and zero-infrastructure.

**Recommendation** — Add in-memory indexes. 2-hour task, 1 file changed:
- `apps/backend/src/events/store.ts`: add `byEventName`, `byTokenId` indexes in `append()`, rewrite `getAll()`, `queryByAgent()`, `getTokenIdsByOwner()` to use them

---

## Finding 3: AgentDetail Sequential Round Trips

AgentDetail mounts → `useAgentMetadata` fires (6 on-chain reads via wagmi multicall — OK, these are parallel) → renders → `PaymentPanel` mounts → its `useEffect` fires `Promise.all([getPaymentConfig(), getEarnings(tokenId)])`. Two sequential phases: on-chain RPCs must complete rendering before HTTP calls can begin.

**Smaller delta** — Hoist `getPaymentConfig()` into the `useAgentMetadata` hook (or a sibling prefetch call in AgentDetail) so it fires on the **same tick** as the metadata fetch. The on-chain calls and the HTTP call for payment config start in parallel before the first render completes. This eliminates one serialization point. ~15 LOC changed in `AgentDetail.tsx`.

**More elegant** — A data-dependency-graph hook system: `usePrefetch(deps, { '/v1/payment/config': ..., '/v1/agents/:id/earnings': ... })`. Dependencies are declared as part of the page component's static definition, and a query client (TanStack Query / React Query) deduplicates, caches, and prefetches them before the page renders. Stale-while-revalidate means the polls don't re-trigger full waterfalls.

**Not architecturally coherent** — Data loading is scattered by component boundary rather than by data dependencies. The payment config is needed by the page, not just by `PaymentPanel`. Hiding it inside a child component guarantees a waterfall because the child can't render until the parent does. This is a **component-boundary data coupling** anti-pattern.

**Overengineered** — Server-side rendering (SSR) or a full GraphQL layer just to fix a 2-RTT waterfall. The API surface is tiny (17 routes); GraphQL overhead would exceed its benefit.

**Recommendation** — Prefetch in AgentDetail before rendering PaymentPanel. 1-hour task, 2 files changed:
- `apps/frontend/src/pages/AgentDetail.tsx`: call `getPaymentConfig()` in a `useEffect` at the top level, pass cached config down to `PaymentPanel`
- `apps/frontend/src/components/PaymentPanel.tsx`: accept optional pre-fetched `config` prop

---

## Finding 4: Duplicated URL Path Construction

`/v1/agents/${id}/...` is URL-template-constructed in 5 hook locations (usePayment ×3, useTransfer ×1, and the backend router matching), and the WebSocket `/v1/stream` URL is independently built in `useOrchestratorTick.ts` (lines 115–119) and `useEventStream.ts` (lines 45–47).

**Smaller delta** — Extract a `getAgentApiPath(tokenId: bigint, subpath: string): string` helper in a new `utils/apiPaths.ts`. Replace the 4 inline template literals in the hooks. Also extract `buildWsUrl(topics: string[]): string` from both WebSocket hooks. ~25 LOC added, ~30 LOC removed across 4 files.

**More elegant** — A typed API client class with methods like `agent.pay(id, amount)`, `agent.earnings(id)`, `agent.transfer(id, body)`. Each method returns typed response types. This eliminates URL construction entirely (it lives in one class) while also centralizing timeout/retry/error-handling logic currently duplicated across hooks. The existing hooks become thin wrappers or get inlined.

**Not architecturally coherent** — Path strings are opaque magic values scattered across hooks and the backend router. A change like renaming `/v1/agents/:id/earnings` to `/v1/agents/:id/payment/earnings` requires grepping 8+ locations with no compiler protection. This is a **lack of single source of truth** for the API contract.

**Overengineered** — tRPC or a full OpenAPI codegen pipeline. The route surface is small and stable; a typed class covers it with 1/10th the tooling complexity.

**Recommendation** — Extract `apiPaths.ts` helpers. 1-hour task, 4 files changed:
- `apps/frontend/src/utils/apiPaths.ts` (new): `agentPath(id, subpath)`, `buildWsUrl(topics)`
- `apps/frontend/src/hooks/usePayment.ts`: replace inline template literals
- `apps/frontend/src/hooks/useTransfer.ts`: replace inline template literal
- `apps/frontend/src/hooks/useOrchestratorTick.ts` + `useEventStream.ts`: use shared `buildWsUrl()`

---

## Finding 5: Hardcoded/Mock Data on HomePage

Three hardcoded values in `HomePage.tsx`:
1. `{1}` for "Vaults Live" (line 185)
2. `7857` for "iNFT Standard" (line 189)
3. `0G` for "Storage & Compute" (line 193)

**Smaller delta** — Replace `{1}` with a call to `GET /v1/events?eventName=Deposited` (count unique vault addresses) or a new lightweight `GET /v1/stats` endpoint that returns `{ vaultCount, nftStandard, storageProvider }`. Inline a quick backend route that returns static config values from env variables. The 7857 and 0G values become env-driven or fetch-driven. ~30 LOC across backend + frontend.

**More elegant** — Expose a `GET /v1/protocol/stats` route that reads on-chain state (total vaults from Vault contract, ERC standard identifier from AgentNFT contract, storage layer from a config store). The frontend `HomePage` calls this on mount and renders the real values. No hardcoded numbers anywhere.

**Not architecturally coherent** — The homepage — the first thing users see — displays fake data that could mislead. The vaults-count of `1` happens to be accurate right now but won't stay that way. The 7857 is a non-standard ERC number (ERC-7857 doesn't exist, it's fictional branding). This is a **trust-destroying pattern** when a user sees stale data and has no way to distinguish it from real data.

**Overengineered** — An entire analytics pipeline, dashboard, or subgraph. A single `/v1/protocol/stats` endpoint serving pre-computed values from a contract batch call is sufficient.

**Recommendation** — Add a stats endpoint and remove hardcoded values. 2-hour task, 3 files changed:
- `apps/backend/src/server.ts`: add `GET /v1/protocol/stats` route (batch-calls Vault + AgentNFT contracts for live count + standard identifier; falls back to env config for storage label)
- `apps/frontend/src/pages/HomePage.tsx`: call new endpoint on mount, render real values

---

## Summary

| Finding | Delta LOC | Elegant LOC | Effort | Risk |
|---------|-----------|-------------|--------|------|
| 1. Dead routes | −50 | −50 | 30 min | Low (delete-only) |
| 2. O(n) events | +50 | +200 (SQLite) | 2 h | Low (pure in-memory) |
| 3. Waterfall | +15 | +80 (React Query) | 1 h | Low |
| 4. URL duplication | −5 net | +120 (typed client) | 1 h | Low |
| 5. Hardcoded data | +30 | +60 | 2 h | Low |

**Total minimal delta**: 140 LOC changed across ~10 files, ~6.5 hours.
