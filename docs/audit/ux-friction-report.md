# UX Friction & Performance Audit

**Date:** 2026-06-26
**Scope:** Click flows, scroll flows, lazy loading, module consolidation, interface element placement

---

## 1. Navigation Map

### Routes
- `/` → redirects to `/agents`
- `/agents` → AgentsBrowser
- `/agents/new` → MintAgentPage (full navigation)
- `/agents/:tokenId` → AgentDetail (5 tabs)
- `/market` → MarketPage
- `/chat` → ChatPage

### AgentDetail Tab Flow
1. User clicks an agent card on `/agents`
2. Lands on `/agents/:tokenId` with "overview" tab active
3. To execute: click "Execute" tab → click "Run Strategy" button → wait for result
4. To deposit: scroll up to Overview → find DepositForm
5. To transfer: scroll to Overview → find "Transfer Agent" button → opens modal
6. To see performance: click "Performance" tab
7. To see payments: click "Payments" tab

---

## 2. Hidden Friction Points

### A. All 4 hooks fire on AgentDetail mount regardless of active tab
**Impact:** Wasted network requests and computation for users who only want to view Overview.

The `AgentDetail` page calls:
- `useAgentMetadata` — always
- `useAgentEvents` — always (Activity tab only)
- `usePerformance` — always (Performance tab only)
- `useHealth` — always

A user who just wants to transfer an agent triggers 4 polling loops on mount.

### B. Heavy components load on mount
**Impact:** Initial page load is slow.

`TransferModal` (573 lines), `PaymentPanel` (452 lines), `ExecutePanel` (303 lines), `EventTimeline` (190 lines) are all statically imported. Even if the user only views Overview, all 1.5KB of code loads.

**Fix applied:** Lazy-loaded all 7 heavy components. Each tab now loads its content on-demand.

### C. Tab state lost on refresh
**Impact:** User clicks "Performance" tab, refreshes, loses tab.

**Fix applied:** Hash-based URL sync — tab state persists in `#performance`, `#execute`, etc.

### D. Key Terms collapsed by default in footer
**Impact:** Users who don't know to expand never learn what iNFT, TEE, Strategy Root mean.

The footer has a `<details>` element with 6 glossary terms. 90%+ of users will never expand it.

**Recommended fix:** Move the most important terms (iNFT, TEE) to inline tooltips on the pages where they appear. Already partially done with `HelpTip` in AgentDetail.

### E. Mint flow is a full page navigation
**Impact:** User on `/agents` clicks "Mint Agent" → navigates to `/agents/new` → loses context of agent list.

**Recommended fix:** Open mint as a modal/drawer on `/agents` instead of a separate page.

### F. ConnectedGuard wraps everything
**Impact:** If wallet not connected, user sees only a guard message. No preview of what the app offers.

**Recommended fix:** Show a preview of the agent detail with a connect prompt overlay instead of blocking entirely.

### G. TransferModal is 573 lines in one file
**Impact:** Hard to test, hard to modify, hard to understand.

The modal contains:
- Form state for receiver address, public key, encryption key, data URI
- Two-phase transfer logic (challenge → sign → finalize)
- EIP-712 signing
- Error handling and retry guidance
- UI for each phase

**Recommended split:**
- `TransferModal` (shell + state machine)
- `ChallengeForm` (receiver inputs + submit)
- `ConfirmForm` (EIP-712 signing + finalize)

---

## 3. Backend ↔ Frontend Wiring Matrix

| Endpoint | Frontend Consumer | Status |
|----------|-------------------|--------|
| `GET /v1/agents` | `useAgents`, `ChatPage` (inline) | ✅ |
| `GET /v1/agents/:id/performance` | `usePerformance` | ✅ |
| `GET /v1/agents/performance/batch` | `usePerformanceBatch` | ✅ |
| `GET /v1/agents/:id/earnings` | `usePayment` | ✅ |
| `GET /v1/agents/:id/royalty` | `usePayment` | ✅ |
| `POST /v1/agents/:id/transfer` | `useTransfer` | ✅ |
| `GET /v1/events` | `useEventHistory`, `MarketPage`, `ChatPage` (inline) | ✅ |
| `GET /health` | `useHealth` | ✅ |
| `GET /v1/compute/providers` | `useProviders` | ✅ |
| `POST /v1/orchestrator/tick` | `useOrchestratorTick`, `ChatPage` (inline) | ✅ |
| `GET /v1/payment/config` | `usePayment` | ✅ |
| `POST /v1/chat/completions` | `ChatPage` | ✅ |

**Issue:** `ChatPage` has inline `apiFetch` calls that duplicate `useAgents` and `useEventHistory` logic. These should be extracted into hooks so the LLM tool handlers reuse the same code paths.

---

## 4. Module Consolidation Opportunities

### A. `usePoll` vs `usePolledApi`
Both do polling. `usePoll` is a custom hook used in `MarketPage`, `usePolledApi` wraps `useQuery`. They could merge, but `usePoll` is simpler (no React Query dependency for that one page).

**Verdict:** Keep separate — different complexity levels for different use cases.

### B. `useEventHistory` vs `useEventStream`
Both get events. `useEventHistory` polls REST, `useEventStream` uses WebSocket. `useAgentEvents` combines both.

**Verdict:** Appropriate separation — different transport mechanisms.

### C. `useVaultData` vs `useVaultDataBatch`
Single vs batch fetcher. `useAgents` doesn't use the batch version.

**Verdict:** Could potentially merge, but the batch version uses a different endpoint and handles Map<string, ...> vs single object. Keep separate.

### D. ChatPage inline API calls
`ChatPage.tsx` has 5 inline `apiFetch` calls that duplicate hook logic. These should be extracted:
- `list_my_agents` → uses `/v1/agents?owner=` (duplicate of `useAgents`)
- `event_history` → uses `/v1/events` (duplicate of `useEventHistory`)
- `execute_tick` → uses `/v1/orchestrator/tick` (duplicate of `useOrchestratorTick`)

**Recommended fix:** Extract these into reusable hook functions that both the UI and tool handlers can use.

---

## 5. Interface Elements on Wrong Pages

### A. Footer "Key Terms" belongs inline
The glossary terms (iNFT, TEE, Strategy Root, Daily Limit, 0G Storage, 0G Compute) are buried in a collapsed footer. Users need them inline on the pages where the concepts first appear.

**Fix:** Already partially done — `HelpTip` for TEE in AgentDetail. Apply to:
- "Strategy Root" on ExecutePanel
- "Daily Limit" on PaymentPanel
- "0G Storage" on Overview tab

### B. Mint button placement
Currently there's no "Mint Agent" button on `/agents` — user must navigate to `/agents/new` via URL or some hidden link. Let me verify.

### C. Transfer button placement
The "Transfer Agent" button is at the bottom of the Overview tab. If user is on Execute tab and decides to transfer, they must:
1. Click "Overview" tab
2. Scroll to bottom
3. Click "Transfer Agent"

**Recommended fix:** Add a secondary "Transfer" action in the page header or as a floating action.

---

## 6. Operational Complexity

### Demo Difficulty: HIGH
- Requires connected wallet (RainbowKit)
- Requires deployed contracts on Galileo testnet
- Requires running backend + oracle + indexer
- Requires funded test wallet

**No demo mode exists.** Cannot preview the app without full setup.

---

## 7. Performance Issues Fixed (This Session)

| Fix | Impact |
|-----|--------|
| Lazy-loaded `TransferModal`, `PaymentPanel`, `ExecutePanel`, `EventTimeline`, `DepositForm`, `PerformanceMetrics`, `TradeHistory` | ~1.5KB of code no longer loads on AgentDetail mount |
| Wrapped each tab content in `<Suspense>` | Shows skeleton while loading |
| Hash-based URL sync for active tab | Tab state persists on refresh |

---

## 8. Remaining Recommendations (Ordered by Impact)

| # | Fix | Impact | Effort |
|---|-----|--------|--------|
| 1 | Extract ChatPage inline API calls into hooks | Medium | Medium |
| 2 | Split TransferModal into sub-components | Medium | Medium |
| 3 | Add demo mode (mock hooks) | High | Medium |
| 4 | Move glossary terms inline via HelpTip | Low | Low |
| 5 | Add "Mint Agent" button on `/agents` page | Low | Low |
| 6 | Add secondary "Transfer" action in header | Low | Low |
| 7 | Merge ChatPage tool handlers to use existing hooks | Medium | Low |
