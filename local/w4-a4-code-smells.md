# Axiom Protocol — Code Smells & Anti-Patterns Report

**Date**: 2026-06-28
**Scanner**: W4A4-CodeSmells (Code Smells & Anti-Patterns Agent)
**Scope**: `apps/{backend,frontend,indexer,oracle,contracts}/src/` + `packages/config/src/`
**Constraint**: READ-ONLY — findings only, no edits.

---

## 1. LONG FILES (>500 lines) — Potential God Modules

### 1a. `packages/config/src/abis/generated.ts` — 2,403 lines
- **Severity**: LOW (auto-generated from ABI JSON)
- **Issue**: Contains 5 monolithic ABI exports (`axiomAgentNftAbi`, `axiomMockUsdcAbi`, `axiomPaymentProcessorAbi`, `axiomStrategyVaultAbi`, `axiomTeeVerifierAbi`) — each 400–600 lines of inline array literals. While auto-generated, this hinders readability.
- **Evidence**: `packages/config/src/abis/generated.ts` — all 2403 lines are one big `as const` array per contract.

### 1b. `apps/frontend/src/pages/ChatPage.tsx` — 798 lines
- **Severity**: HIGH
- **Issue**: God component combining tool definitions, tool handlers, SSE parser, streaming logic, and UI rendering in one file. Violates single-responsibility.
- **Evidence**: Lines 119–267 (10 tool definitions in a single `TOOLS` array), lines 270–423 (`useToolHandlers` — 9 handlers in one `useMemo`), lines 441–796 (`ChatPage` component with SSE processing, multi-turn tool loop, and full JSX render).
- **Impact**: Difficult to unit test, any change to tool definitions or streaming logic risks breaking unrelated features.

### 1c. `apps/indexer/src/watcher.ts` — 625 lines
- **Severity**: MEDIUM
- **Issue**: Combines event decoding (the 28-case switch), poll logic, checkpoint file I/O, and the `Watcher` class in one file.
- **Evidence**: Lines 137–438: `decodeAxiomLog` function spanning 300 lines. Lines 440–462: `pollOnce`. Lines 474–495: checkpoint I/O. Lines 497–623: `Watcher` class.

### 1d. `apps/frontend/src/components/TransferModal.tsx` — 573 lines
- **Severity**: MEDIUM
- **Issue**: One file containing 3 sub-components (`PhaseIndicator`, `TransferFormPhase`, `ConfirmTransferPhase`) plus the main `TransferModal`. The multi-phase wizard logic is tightly coupled in one file.
- **Evidence**: Lines 52–65 (`PhaseIndicator`), 69–236 (`TransferFormPhase`), 240–322 (`ConfirmTransferPhase`), 326–571 (`TransferModal`).

### 1e. `apps/frontend/src/components/PaymentPanel.tsx` — 452 lines
- **Severity**: MEDIUM
- **Issue**: Contains PaymentConfig, PaymentForm, EarningsSection, RoyaltySection, and the main panel — all in one file.
- **Evidence**: Lines 47–76, 78–128, 130–203, 205–260, 268–448.

### 1f. `apps/frontend/src/components/ui.tsx` — 477 lines
- **Severity**: LOW (accumulated component library)
- **Issue**: Kitchen-sink UI component file with 15+ exported components: Button, Card, Input, Alert, ErrorAlert, Skeleton, PageHeader, SectionTitle, MonoLabel, Spinner, Modal, ConnectedGuard, HelpTip.
- **Evidence**: All components exported from one file — any import of a single component loads the whole file (tree-shaking aside).

---

## 2. LONG FUNCTIONS (>50 lines) — God Functions

### 2a. `apps/indexer/src/watcher.ts:137-438` — `decodeAxiomLog()` — ~300 lines
- **Severity**: HIGH
- **Issue**: A single function containing a 28-case switch statement where each case performs identical operations (`decodeEventLog`, spread `base`, return typed object). Massive duplication.
- **Evidence**: Lines 158–437 — every case is structurally identical boilerplate: `case "...": { const d = decodeEventLog(...); return { kind: "...", ...base, ... }; }`.
- **Impact**: Adding a new event requires copy-pasting the same pattern; one wrong field name breaks compilation.

### 2b. `apps/frontend/src/pages/ChatPage.tsx:441-796` — `ChatPage()` — ~355 lines
- **Severity**: HIGH
- **Issue**: Combines SSE streaming reader, multi-turn tool-call loop (`while` loop with `MAX_TOOL_LOOPS`), complex state management, and JSX rendering.
- **Evidence**: The `sendMessage` callback (lines 492–638) is ~150 lines containing SSE chunk parsing, tool dispatch, and error handling interleaved with `setMessages` calls.

### 2c. `apps/frontend/src/pages/ChatPage.tsx:270-423` — `useToolHandlers()` — ~153 lines
- **Severity**: MEDIUM
- **Issue**: 9 tool handlers crammed into a single `useMemo`. Each handler is a closure with separate concerns, but all share the same `useMemo` scope.
- **Evidence**: Lines 270–422 — all handlers (list_my_agents, vault_balance, agent_metadata, event_history, execute_tick, mint_agent, deposit, withdraw, archive tools) in one monolithic return object.

### 2d. `apps/backend/src/server.ts:49-297` — `startServer()` — ~248 lines
- **Severity**: HIGH
- **Issue**: God function configuring Express middleware, route registration for 10+ endpoints, WebSocket setup with heartbeat, error handling — all in one function.
- **Evidence**: Lines 49–297 includes: helmet/CORS/rate-limit setup (69–85), health router (137), compute providers endpoint (140), chat completions proxy (160), archive routes (183–215), payment routes (220–258), WebSocket server (272–288), error handler (261–269).

### 2e. `apps/frontend/src/components/TransferModal.tsx:326-571` — `TransferModal()` — ~245 lines
- **Severity**: MEDIUM
- **Issue**: Multi-phase wizard (idle → form → confirm → signing → finalizing) with all logic in one component.
- **Evidence**: Lines 326–571 contain phase state management, form validation, EIP-712 signing, transaction dispatch, and render logic for 3+ UI phases.

### 2f. `apps/backend/src/routers/agents.ts:111-209` — Transfer handler — ~98 lines
- **Severity**: MEDIUM
- **Issue**: Single route handler contains two-phase transfer logic (challenge + finalize), oracle interaction, pubkey manipulation, and raw JSON response construction.
- **Evidence**: Lines 112–209 — parameter extraction, dataHash resolution, pubkey stripping, challenge/finalize dispatch, error handling all in one async function.

---

## 3. DEEP NESTING (>4 indentation levels)

### 3a. `apps/backend/src/events/store.ts:104-117` — `queryByAgent()`
- **Severity**: LOW
- **Issue**: `if` inside `for` inside `for` at 4 levels.
- **Evidence**: Lines 104-117 — outer function → `for...of bucket` → `if (query.eventName)` → `if (query.source)`, plus the sort/limit slice.

### 3b. `apps/frontend/src/hooks/useEventStream.ts:99-103` — exponential backoff reconnect
- **Severity**: LOW
- **Issue**: Nested `if` inside calculation inside `if`.
- **Evidence**: `if (enabledRef.current)` → `const delay = Math.min(..., maxReconnectDelay)` → inside `setTimeout(connect, delay)` — 3 levels deep in a hook effect.

### 3c. `apps/backend/src/routers/agents.ts:128-167` — transfer handler logic
- **Severity**: MEDIUM
- **Issue**: `try` → `if (!config.addresses)` → `if (dataHash)` → `if (pk.length)` → `if (!accessProof)` → `if (canRekey)`. Potentially 6 levels of nesting.
- **Evidence**: Lines 113-209 — `try` wrapping `if (!id)` → `if (!config.addresses)` → `const ... = body.parse` → `if (dataHash)` → `if (pk.length)` → `if (!accessProof)` → `if (canRekey)`.

### 3d. `apps/backend/src/orchestrator/index.ts:88-129` — `runTick()` — moderate
- **Severity**: LOW
- **Issue**: `async method` → `Promise.all` → `recommendation.action === "hold"` → `.catch(() => { return {...} })`.
- **Evidence**: Lines 101-113 — ternary with `? undefined : await .catch()` creates a 3-level branch.

---

## 4. STRINGLY-TYPED CODE

### 4a. Route paths as raw strings (severe shotgun-surgery risk)
- **Severity**: HIGH
- **Issue**: All API route paths (`"/v1/agents"`, `"/v1/events"`, `"/v1/chat/completions"`, `"/v1/orchestrator/tick"`, `"/v1/compute/providers"`, etc.) are hardcoded as string literals at each router definition AND in the frontend API paths file AND in the E2E test script. Changing a path requires editing 3+ files.
- **Evidence**:
  - Backend: `apps/backend/src/routers/agents.ts:33` — `app.get("/v1/agents", ...)`
  - Backend: `apps/backend/src/routers/agents.ts:112` — `app.post("/v1/agents/:id/transfer", ...)`
  - Backend: `apps/backend/src/routers/events.ts:16` — `method: "post", path: "/v1/events"`
  - Backend: `apps/backend/src/server.ts:160` — `app.post("/v1/chat/completions", ...)`
  - Backend: `apps/backend/src/server.ts:187` — `path: "/v1/archive/snapshots"`
  - Backend: `apps/backend/src/server.ts:222` — `path: "/v1/agents/:id/earnings"`
  - Backend: `apps/backend/src/server.ts:248` — `path: "/v1/payment/config"`
  - Oracle: `apps/oracle/src/server.ts` — `"/v1/transfer-validity"`, `"/v1/ownership"`, `"/v1/agents/mint"`
  - Oracle client: `apps/backend/src/oracle/client.ts:65` — `"/v1/transfer-validity"`
  - Oracle client: `apps/backend/src/oracle/client.ts:69` — `"/v1/ownership"`
  - Frontend: `apps/frontend/src/utils/apiPaths.ts` — scattered path references
  - Frontend: `apps/frontend/src/hooks/useOrchestratorTick.ts` — implicit paths
  - E2E: `apps/backend/src/cli/run-e2e.ts:142` — `"/v1/orchestrator/tick"`
  - E2E: `apps/backend/src/cli/run-e2e.ts:182` — `"/v1/agents/${tokenId}/transfer"`
  - E2E: `apps/backend/src/cli/run-e2e.ts:228` — same path repeated
- **Recommendation**: Extract to `packages/config/src/api/routes.ts` as typed constants (e.g. `ROUTES.v1.agents.list`).

### 4b. Event names as raw strings
- **Severity**: MEDIUM
- **Issue**: Event names like `"Transfer"`, `"StrategySet"`, `"Tick"`, `"Deposited"` appear as string literals in backend routers, event store queries, and orchestrator logic — with no shared enum.
- **Evidence**:
  - `apps/backend/src/events/store.ts:145` — `if (evt.eventName !== "Transfer") continue`
  - `apps/backend/src/routers/performance.ts:19` — `eventName: "Tick"`
  - `apps/backend/src/routers/performance.ts:59` — `eventName: "Tick"`
  - `apps/backend/src/routers/orchestrator.ts:57` — `eventName: "Tick"`
  - `apps/backend/src/orchestrator/index.ts:251-252` — `"StrategySet"`, `"Deposited"` as raw strings
  - `apps/backend/src/orchestrator/index.ts:267` — `"StrategySet"` used for log matching
- **Recommendation**: Reuse the `EventName` type from `apps/indexer/src/events.ts:78` across all backend modules. Create a shared constants package.

### 4c. Network/chain names as object literals
- **Severity**: LOW (localized)
- **Issue**: Chain IDs (16602, 16661) are well-defined in `packages/config/src/networks.ts`, but fallback URLs leak as raw strings throughout the codebase.
- **Evidence**:
  - `apps/backend/src/compute/router.ts:18` — `"https://router-api-testnet.integratenetwork.work/v1"`
  - `apps/backend/src/compute/provider-discovery.ts:77` — `"https://evmrpc-testnet.0g.ai"`
  - `packages/config/src/networks.ts:56` — `"https://evmrpc-testnet.0g.ai"`
  - `packages/config/src/networks.ts:64` — `"https://indexer-storage-testnet-turbo.0g.ai"`
  - `packages/config/src/networks.ts:69` — `"https://chainscan-galileo.0g.ai"`

### 4d. Oracle route paths as raw strings
- **Severity**: MEDIUM
- **Issue**: `DefaultSignerOracleClient` constructs URLs by concatenating `baseUrl` with path strings: `"/v1/transfer-validity"`, `"/v1/ownership"`. These paths are duplicated in the oracle server and the backend client.
- **Evidence**: `apps/backend/src/oracle/client.ts:65,69` — string literals; `apps/oracle/src/server.ts:62,141,234` — same strings.

---

## 5. MAGIC NUMBERS / STRINGS

### 5a. Numeric constants without named constants
- **Severity**: MEDIUM
- **Issue**: Various magic numbers embedded in backend/frontend logic.
- **Evidence**:
  - `apps/backend/src/server.ts:84` — `rateLimit({ windowMs: 60_000, max: 100 })` — 60_000 and 100 as raw literals
  - `apps/backend/src/server.ts:123` — `HEARTBEAT_INTERVAL = 30_000` (good: named)
  - `apps/backend/src/server.ts:70` — `DEV_FRONTEND_ORIGIN = 'http://localhost:5173'` (good: named)
  - `apps/backend/src/routers/agents.ts:30` — `AGENT_CACHE_TTL = 30_000;` (good: named)
  - `apps/backend/src/routers/agents.ts:159` — `86400` (seconds in a day) as inline magic number
  - `apps/backend/src/routers/agents.ts:170` — `86400n` (same value, repeated)
  - `apps/backend/src/server.ts:166` — `max_tokens: 2048` (hardcoded, but defined as `DEFAULT_MAX_TOKENS` elsewhere in `utils/constants.ts:17`)
  - `apps/backend/src/compute/provider-discovery.ts:19` — `CACHE_TTL_MS = 300_000` (good: named)
  - `apps/backend/src/compute/router.ts:40` — `ROUTER_TIMEOUT_MS = 30_000` (good: named)
  - `apps/backend/src/orchestrator/index.ts:248` — `latest - 2000` — magic block range
  - `apps/backend/src/events/store.ts:11` — `DEFAULT_MAX_EVENTS_PER_SOURCE = 1000` (good: named)
  - `apps/frontend/src/components/PaymentPanel.tsx:35` — `ms = 6000` (auto-clear timeout)
  - `apps/frontend/src/components/PaymentPanel.tsx:232` — `max={10000}` (BPS max, defined as constant in contract `BPS_DENOMINATOR`)
  - `apps/frontend/src/hooks/useOrchestratorTick.ts:38` — `MAX_STREAMED_TOKENS = 50000` (good: named)

### 5b. `apps/backend/src/routers/agents.ts:63` — `"0x" + "00".repeat(12) + owner.slice(2)` — address padding hack
- **Severity**: LOW
- **Issue**: Manually constructing a padded address for `eth_getLogs` topic filtering. The `0x0000...` pattern and the `repeat(12)` are opaque.

### 5c. Solidity contracts: `BPS_DENOMINATOR = 10_000` — good practice
- **Severity**: NONE (positive finding)
- **Note**: The Solidity contracts do a good job of naming constants (`BPS_DENOMINATOR`, `STORAGE_LOCATION`, typehashes). No magic number issues found in contracts.

---

## 6. GOD OBJECTS / HIGH IMPORT COUPLING

### 6a. `apps/backend/src/server.ts` — 35+ imports from 13+ modules
- **Severity**: HIGH
- **Issue**: The server file imports and orchestrates everything: Express, ethers, WebSocket, all routers, the orchestrator, event store, payment processor, archive service, compute router, provider discovery, EIP-712 domain, middleware. It's the central hub god object.
- **Impact**: Any change to the system architecture likely requires touching this file.

### 6b. `apps/backend/src/orchestrator/index.ts` — `StrategyRunner` class
- **Severity**: MEDIUM
- **Issue**: The orchestrator imports 11 different modules/services: ethers, TypedContract, TickResult types, OpenAI, ZeroGStorage, compute router, oracle client, network config, ABI, logger. It bridges compute, storage, on-chain state, and oracles.
- **Evidence**: Lines 1–12 — `StrategyRunner` knows about all these subsystems.

### 6c. `apps/frontend/src/pages/ChatPage.tsx` — imports 5 ABI files + 5 UI components + wagmi + viem + apiFetch
- **Severity**: MEDIUM
- **Issue**: ChatPage is a god component that depends on the entire system: agent NFT ABI, vault ABI, wallet connection, backend URL, all UI components, service APIs (Wayback Machine), and custom hooks.
- **Evidence**: Lines 1–17 — 12+ import lines pulling from across the codebase.

### 6d. `apps/frontend/src/components/ui.tsx` — the kitchen-sink component
- **Severity**: LOW
- **Issue**: 15+ components exported from one file. Even though tree-shaking should handle it, the file itself is a grab-bag with no clear grouping.

---

## 7. SHOTGUN SURGERY — Scattered Changes Required

### 7a. Adding a new event type requires changes in 4+ files
- **Severity**: HIGH
- **Issue**: Adding an on-chain event requires:
  1. `packages/config/src/abis/generated.ts` — add ABI (auto-generated)
  2. `apps/indexer/src/events.ts` — add signature + type definition + ABI entry (~3 sections)
  3. `apps/indexer/src/watcher.ts` — add case to the 28-case switch + `TOPIC_TABLE` + `DEFAULT_WATCH_LIST`
  4. `apps/backend/src/events/payloads.ts` — add payload interface (optional)
  5. `apps/backend/src/events/store.ts` — no change needed (generic key-value)
  6. Possibly `apps/frontend/src/utils/events.ts` — frontend handler
- **Evidence**: `apps/indexer/src/events.ts:12-170` — event name, signature, ABI table, and type union defined separately. `apps/indexer/src/watcher.ts:56-72` — topic mapping. `apps/indexer/src/watcher.ts:115` — watch list.

### 7b. Adding a new tool to the AI chat requires changes in 4+ locations
- **Severity**: MEDIUM
- **Issue**: Adding a chat tool requires:
  1. `apps/backend/src/server.ts` — add route handler
  2. `apps/backend/src/route-schemas.ts` — maybe add schema
  3. `apps/frontend/src/pages/ChatPage.tsx` — add `TOOL_LABELS` entry, `TOOLS` entry, handler in `useToolHandlers`
  4. `apps/frontend/src/pages/ChatPage.tsx` — add rendering in `formatToolResult`
  5. Possibly frontend hooks or components
- **Evidence**: Three independent sections of ChatPage.tsx must be edited for any new tool.

### 7c. Changing the API prefix (e.g., `/v1/` → `/v2/`) — 10+ files
- **Severity**: HIGH
- **Issue**: The `/v1/` prefix is hardcoded as a string literal in every individual route definition (backend, oracle, frontend apiPaths, E2E tests).
- **Evidence**: 30+ occurrences across backend routers, oracle server, frontend API utilities, and E2E test files (see section 4a).

---

## 8. FEATURE ENVY

### 8a. `apps/indexer/src/watcher.ts:137-438` — `decodeAxiomLog()` uses data from `events.ts` heavily
- **Severity**: LOW
- **Issue**: The function is mostly a dispatcher that reads `TOPIC_TO_EVENT`, `EVENT_ABI`, and `AxiomEvent` types from `events.ts`, performing field extraction for each event kind. This is inherent to the domain but the 28-case duplication strongly suggests the dispatch should live closer to the type definitions.

### 8b. `apps/backend/src/routers/performance.ts:58-68` — queries `EventStore` and reads raw payload fields
- **Severity**: LOW
- **Issue**: The performance router calls `payloadField(evt.payload, "action")` and `payloadField(evt.payload, "reason")` — it's reaching into the event store's data structures rather than using dedicated methods.
- **Evidence**: Lines 58-68: iterates events and string-matches payload fields.

---

## 9. INAPPROPRIATE INTIMACY

### 9a. Backend ↔ Oracle tight coupling
- **Severity**: MEDIUM
- **Issue**: Backend imports oracle signer types directly (`@axiom/oracle/signer` in `apps/backend/src/server.ts:19` and `apps/backend/src/routers/agents.ts:12-13`). Backend constructs `Eip712Domain` and computes `accessMessageHash` — knowledge of oracle's internal signing scheme leaks into backend.
- **Evidence**:
  - `apps/backend/src/server.ts:19` — `import { type Eip712Domain, DEFAULT_EIP712_DOMAIN } from "@axiom/oracle/signer"`
  - `apps/backend/src/routers/agents.ts:13` — `import { accessMessageHash } from "@axiom/oracle/signer"`
  - `apps/backend/src/routers/agents.ts:190` — `ethers.SigningKey.recoverPublicKey(ethers.getBytes(accessMessageHash(...)))` — backend recovers the pubkey, a responsibility that should be in the oracle module.

### 9b. Vault contract calls its own `_getVaults()` in every method
- **Severity**: LOW
- **Issue**: `AxiomStrategyVault` repeats `Vault storage v = _getVaults()[tokenId]` in every public method. The storage access pattern is intimate with the struct layout in every function.

### 9c. Frontend imports ABI files directly from `@axiom/config/abis` and uses them at page level
- **Severity**: LOW
- **Issue**: ChatPage imports `axiomAgentNftAbi` and `axiomStrategyVaultAbi` at the page level, mixing contract ABI concerns with UI rendering.
- **Evidence**: `apps/frontend/src/pages/ChatPage.tsx:8-9` imports ABIs.

---

## 10. CALLBACK HELL / PROMISE CHAINS

### 10a. `apps/backend/src/routers/orchestrator.ts:45-49` — Promise chain in streaming
- **Severity**: LOW
- **Issue**: `.then()` chained after stream consumption for broadcasting completion/error.
- **Evidence**: Lines 45-49:
  ```ts
  sendToTopic(`tick.${agentTokenId}`, chunk);
  }).then(result => {
    sendToTopic(`tick.${agentTokenId}`, { type: 'complete', ...result });
  }).catch(err => {
    sendToTopic(`tick.${agentTokenId}`, { type: 'error', ... });
  });
  ```

### 10b. `apps/frontend/src/pages/ChatPage.tsx:514-625` — `while` loop with nested async/await
- **Severity**: LOW–MEDIUM
- **Issue**: The multi-turn tool loop uses `while` + nested `fetch` + `getReader()` + `while(true)` read loop + `for (const chunk)` + tool dispatch loop + `for (const tc)` + error handling. This is not callback hell per se but the control flow is labyrinthine (nested loops 5 levels deep).
- **Evidence**: Lines 510-625 — `while (loopCount < MAX_TOOL_LOOPS)` wrapping `fetch` wrapping `while(true)` read loop wrapping `for (const chunk)` with `if (delta.tool_calls)` wrapping `for (const tc)`.

### 10c. Event stream code: `apps/frontend/src/hooks/useEventStream.ts` — WebSocket reconnect timer
- **Severity**: LOW
- **Issue**: Exponential backoff reconnect implemented with `setTimeout` nesting, creating a potential closure-over-stale-refs issue.
- **Evidence**: Lines 99-103: `reconnectTimerRef.current = setTimeout(connect, delay)` inside an effect — the `connect` function captures refs that may be stale.

---

## 11. SWITCH / IF-ELSE CHAINS

### 11a. `apps/indexer/src/watcher.ts:158-437` — 28-case switch in `decodeAxiomLog()`
- **Severity**: HIGH
- **Issue**: A 280-line switch with 28 identical-structure branches. Each case follows the exact same pattern: `case "EventName": { const d = decodeEventLog(...); return { kind: "EventName", ...base, ... }; }`.
- **Evidence**: Lines 158-437 — 28 cases (`Transfer`, `Updated`, `Authorization`, ..., `BeaconUpgraded`, `Initialized`). Each is ~8-15 lines of boilerplate.
- **Impact**: Adding a new event requires copy-pasting 10+ lines and changing field names. Any change to how events are decoded (e.g., adding validation) requires touching all 28 branches. This should be driven by a registry/mapping from event signature to decoder function.

### 11b. `apps/frontend/src/App.tsx:107-110` — keyboard shortcut switch
- **Severity**: LOW
- **Issue**: Small 3-case switch for navigation shortcuts (`g`, `m`, `c`). Not a major smell but could be a map.

### 11c. `apps/backend/src/orchestrator/index.ts:267` — inline ternary as conditional chain
- **Severity**: LOW
- **Issue**: `name = topic0 === strategyTopic ? "StrategySet" : topic0 === depositTopic ? "Deposited" : "Unknown"` — nested ternary used instead of a lookup map.
- **Evidence**: Line 267 — two-event check. Acceptable at current size but would grow if more event types were added.

---

## SUMMARY TABLE

| # | Smell | Severity | Key Files | Action |
|---|-------|----------|-----------|--------|
| 1 | Long files | HIGH | ChatPage.tsx (798), watcher.ts (625) | `refactor` — split components/modules |
| 2 | Long functions | HIGH | `decodeAxiomLog` (300 lines), `startServer` (248), `ChatPage` (355) | `extract` — break into smaller functions |
| 3 | Deep nesting | LOW | store.ts (4-level), agents.ts (6-level) | `guard` — early returns |
| 4 | Stringly-typed | HIGH | Route paths (30+ occurrences), event names (10+), oracle paths | `extract` — shared constants/enums |
| 5 | Magic numbers | MEDIUM | `86400`, `2000`, `60_000`, `2048`, `300_000`+ repeated as raw | `inline` → named constants from `utils/constants.ts` |
| 6 | God objects | HIGH | `server.ts` (god loader), `ChatPage.tsx` (god component) | `refactor` — split concerns, facades |
| 7 | Shotgun surgery | HIGH | New event = 4+ files changed, new tool = 4+ locations | `refactor` — use registry/polymorphism |
| 8 | Feature envy | LOW | performance.ts reading raw payload fields | `extract` — typed query methods on EventStore |
| 9 | Inappropriate intimacy | MEDIUM | Backend imports oracle signing internals | `refactor` — abstract oracle behind interface |
| 10 | Callback hell | LOW | orchestrator.ts `.then()`, ChatPage.tsx nested loops | `inspect` — could use async/await flattening |
| 11 | Switch chains | HIGH | `decodeAxiomLog` 28-case switch (300 lines) | `refactor` — decoder registry pattern |

---

## PRIORITIZED RECOMMENDATIONS

### P1 — Immediate (HIGH impact, structural)
1. **Refactor `decodeAxiomLog()` switch to a registry** — Replace the 28-case switch with a map from event name to decoder function. Each decoder would live near its type definition in `events.ts`. This eliminates the duplication, makes adding events a single-file change, and reduces the function from 300 lines to ~10.
2. **Centralize route path constants** — Create a `packages/config/src/api/routes.ts` with all API paths as typed constants. Import everywhere. This eliminates shotgun surgery when paths change.
3. **Create shared event name enum** — Export `EventName` from the indexer and reuse it across backend routers (event store, performance, orchestrator). Eliminates raw-string event name mismatches.

### P2 — Short-term (MEDIUM impact)
4. **Split `ChatPage.tsx`** — Extract SSE parser, tool definitions, tool handlers into separate modules. The component should only handle rendering and state orchestration.
5. **Decouple backend from oracle internals** — Don't import `@axiom/oracle/signer` in backend. Create an abstract `OracleVerifier` interface in `@axiom/config` that the oracle module implements.
6. **Replace magic numbers with constants** — `86400` → `SECONDS_PER_DAY`, `2000` → `BLOCK_SCAN_RANGE` (already exists in constants.ts), `2048` → `DEFAULT_MAX_TOKENS` (already exists — use it), `60_000` → named rate-limit constant.

### P3 — Long-term (LOW impact)
7. **Extract sub-components from large files** — Pull `PaymentForm`, `EarningsSection`, `RoyaltySection` from `PaymentPanel.tsx`; pull `PhaseIndicator` from `TransferModal.tsx`.
8. **Extract `startServer()`** — Break middleware setup, route groups (compute, chat, archive, payment, WebSocket) into separate setup functions or files.
