# Exhaustive Root-Cause Analysis: Hidden Flow Complexity

**Date:** 2026-06-26
**Scope:** Frontend ↔ Backend wiring, type duplication, module merge opportunities, misplaced interface elements

---

## 1. Critical Type Mismatch (the one I missed)

### `TickResult` defined in TWO places with DIFFERENT types

**Backend** (`apps/backend/src/orchestrator/index.ts:36`):
```typescript
export interface TickResult {
  recommendation: { action: "buy" | "sell" | "hold"; amount?: number; reason: string };
  rawModelOutput: string;
  onchain: { vaultBalance: bigint; recentEvents: unknown[] };
  storage: { rootHash: `0x${string}`; size: number };
  execution?: { success: boolean; txHash?: string; result: string; error?: string };
  durationMs: number;
}
```

**Frontend** (`apps/frontend/src/hooks/useOrchestratorTick.ts:15`):
```typescript
export type TickResult = {
  recommendation: { action: 'buy' | 'sell' | 'hold'; amount?: number; reason: string };
  rawModelOutput: string;
  onchain: { vaultBalance: string; recentEvents: unknown[] };  // ← bigint vs string!
  // Missing: storage, execution, durationMs!
};
```

**Impact:**
- The backend sends `vaultBalance: bigint`, the JSON replacer converts to string, the frontend type says `string` — this works by coincidence.
- But the frontend type is MISSING `storage`, `execution`, and `durationMs` fields that the backend sends. The frontend `ExecutePanel` accesses these via `result.storage` and `result.execution` — these are typed as `any` at runtime.
- When the backend evolves (adds a field), the frontend won't know.

**Fix:** Move `TickResult`, `TickRequest`, `TickStreamOptions` to `packages/config/src/types/orchestrator.ts`. Import from both sides.

---

## 2. Transfer types duplicated 5x

**Frontend** (`apps/frontend/src/hooks/useTransfer.ts`) defines:
- `TransferInput`
- `AccessProofStruct`
- `OwnershipProofStruct`
- `TransferResponse`
- `TransferPhase`
- `UseTransferResult`

**Backend** (`apps/backend/src/routers/agents.ts`) defines inline Zod schemas (`transferBodySchema`) that produce equivalent shapes.

**Impact:**
- When the backend changes the transfer protocol shape (e.g., adds a field to the response), the frontend won't know until runtime.
- The backend uses Zod for validation; the frontend uses hand-written TypeScript types. Two sources of truth.

**Fix:** Move all transfer types to `packages/config/src/types/transfer.ts`. Backend uses them for Zod schema inference.

---

## 3. Mergeable modules

### Hook consolidation candidates

| Hook | Lines | Purpose | Merge target |
|------|-------|---------|---------------|
| `useAgents` | 1349 | Manual fetch + useAsyncAction | Could use `usePolledApi` (2040 lines) |
| `useEventHistory` | 3268 | Manual polling logic | Could be simplified by `usePolledApi` |
| `useHealth` | 341 | Simple fetch | Could be `usePolledApi` with interval |
| `useProviders` | 619 | Simple fetch | Could be `usePolledApi` |

**Current state:** `usePolledApi` exists but only `useEventHistory` and `usePerformance` use it. Other hooks reimplement the same pattern with `useState` + `useCallback` + `useEffect`.

**Fix:** Migrate `useAgents`, `useHealth`, `useProviders` to use `usePolledApi`. Saves ~50 lines of duplicated polling boilerplate.

### Component consolidation

| Component | Lines | Status |
|-----------|-------|--------|
| `MutedText` | 431 | 1 COLORS reference — borderline over-extracted |
| `EmptyState` | 497 | 3 usage sites — appropriate |
| `MonoInput` | 509 | 4 usage sites — appropriate |
| `MetadataGrid` | 1095 | 3 usage sites — appropriate |

**Verdict:** Smallest components are appropriately extracted. `MutedText` is borderline (1 COLORS ref) but it's a semantic wrapper that improves readability.

### Large components that could be split

| Component | Lines | Split opportunity |
|-----------|-------|-------------------|
| `TransferModal` | 19871 | Split into ChallengeForm + ConfirmForm + ModalShell |
| `PaymentPanel` | 13201 | Split into ConfigForm + EarningsSection + WithdrawSection |
| `ExecutePanel` | 12691 | Split into AgentSelector + TickPanel + ResultPanel |

**Impact:** Splitting these would make each piece testable independently and reduce cognitive load. Currently, changing the transfer protocol requires reading a 20KB file.

---

## 4. Misleading interface elements (on wrong page)

### TransferModal shows agent selector even when locked

`ExecutePanel.tsx:109` shows a `<select>` dropdown even when `tokenIdProp` is provided (embedded in AgentDetail). The `locked` variable prevents changing the selection, but the dropdown is still rendered.

**Fix:** Add `{!locked && (<select>)}` around the dropdown (already done correctly in some places). Verify all dropdowns respect the locked prop.

### PaymentPanel protocol config is always visible

`PaymentPanel.tsx` shows `PaymentConfig` (token address, fee, treasury) on the agent detail page. This is admin-level data that belongs behind a tooltip or in a separate admin view.

**Fix:** Move protocol config to a tooltip on the payment section title.

### AgentCardStatus shows "Mostly buy/sell/Mixed"

`AgentsBrowser.tsx:AgentCardStatus` shows a simplified strategy summary on agent cards. This is a heuristic that may not match the actual strategy. Could be misleading if the user expects accurate data.

**Fix:** Show actual last action (from events) instead of a heuristic. Or label it as "recent trend" to set expectations.

---

## 5. Backend ↔ Frontend wiring matrix

| Backend Endpoint | Frontend Consumer | Status |
|-----------------|-------------------|--------|
| `GET /v1/agents` | `useAgents` → `AgentsBrowser` | ✅ |
| `GET /v1/agents/:id/earnings` | `usePayment` → `PaymentPanel` | ✅ |
| `GET /v1/agents/:id/performance` | `usePerformance` → `AgentDetail` | ✅ |
| `GET /v1/agents/:id/royalty` | `usePayment` → `PaymentPanel` | ✅ |
| `POST /v1/agents/:id/transfer` | `useTransfer` → `TransferModal` | ✅ (via oracle) |
| `GET /v1/agents/performance/batch` | `usePerformanceBatch` | ✅ |
| `POST /v1/chat/completions` | `ChatPage` | ✅ |
| `GET /v1/compute/providers` | `useProviders` → `MarketPage` | ✅ |
| `GET /v1/events` | `useEventHistory` → multiple pages | ✅ |
| `GET /v1/health` | `useHealth` → `HealthBadge` | ✅ |
| `POST /v1/orchestrator/tick` | `useOrchestratorTick` → `ExecutePanel` | ✅ |
| `GET /v1/payment/config` | `usePayment` | ✅ |
| `POST /v1/events` (append) | Indexer | ✅ |

**Zero orphaned endpoints.** Every endpoint has a consumer.

---

## 6. Operational complexity

### Testing difficulty

| Surface | Lines | Test difficulty | Why |
|---------|-------|----------------|-----|
| `TransferModal` | 19871 | High | 5-phase state machine, EIP-712 signatures, oracle coordination |
| `ExecutePanel` | 12691 | High | LLM streaming, WebSocket, on-chain settlement |
| `PaymentPanel` | 13201 | Medium | 4 forms, config + earnings + pay + royalty |
| `AgentDetail` | 277 (after refactor) | Medium | 4 tabs, multiple hooks, complex state |
| `ChatPage` | ~714 | High | SSE streaming, tool calls, message rendering |

**Demo difficulty:** These same surfaces are the hardest to demo because they require:
- A connected wallet
- Deployed contracts on Galileo testnet
- Running backend + oracle + indexer
- Funded test wallet

**Fix:** Add demo mode that bypasses wallet and uses mock data. Could be a single env variable that swaps in mock hooks.

---

## 7. Architectural incoherence

### Type drift between layers

| Type | Defined in | Issue |
|------|------------|-------|
| `TickResult` | Backend + Frontend | **MISMATCH** — backend has bigint, frontend has string |
| `TickRequest` | Backend + Frontend | Schema schema in backend, hand-written in frontend |
| `TickStreamOptions` | Backend + Frontend | Same issue |
| `TransferInput` | Frontend only | Backend has Zod schema, frontend has hand-written type |
| `AccessProofStruct` | Frontend only | Backend produces this shape, frontend re-declares |
| `OwnershipProofStruct` | Frontend only | Same issue |
| `TransferResponse` | Frontend only | Same issue |
| `TransferPhase` | Frontend only | Backend uses string literals |
| `AgentInfo` | Frontend only | Backend returns `{ tokenId: string }`, frontend converts |

**Fix:** Move all cross-layer types to `packages/config/src/types/`. Backend imports for Zod inference. Frontend imports for type checking.

---

## 8. Recommendations (ordered by impact)

| # | Fix | Impact | Effort |
|---|-----|--------|--------|
| 1 | Move `TickResult` to shared package (fix bigint/string mismatch) | **HIGH** — type bug | Low |
| 2 | Move transfer types to shared package | **HIGH** — prevents drift | Low |
| 3 | Migrate `useAgents`/`useHealth`/`useProviders` to `usePolledApi` | Medium | Low |
| 4 | Split `TransferModal` (20KB) into sub-components | Medium | Medium |
| 5 | Add demo mode (mock hooks) | Medium | Medium |
| 6 | Move PaymentPanel config to tooltip | Low | Low |
| 7 | Fix `ExecutePanel` agent selector when locked | Low | Low |
| 8 | Replace "Mostly buy/sell" heuristic with actual last action | Low | Low |

---

## 9. Summary

The codebase is in good shape after multiple rounds of fixes. But the most critical remaining issue is the **`TickResult` type mismatch** — the backend sends fields the frontend type doesn't declare. This is a real type safety gap that would cause runtime issues if the backend evolves.

The second most critical is **transfer type duplication** — 5 types defined in the frontend that mirror the backend's Zod schemas. These should be in the shared package.
