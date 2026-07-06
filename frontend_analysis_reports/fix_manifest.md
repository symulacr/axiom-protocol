# Fix Manifest — Axiom Frontend Audit Remediation

**Orchestrator:** Fixing Orchestrator  
**Last updated:** 2026-07-06  
**Sources:** `frontend_analysis_final_report.md`, SA1/SA2/SA3 sub-agent reports (20260706)

**AUDIT STATUS:** COMPLETE — **Critical: 0** | **High: 0** | Medium/Low: ~40 addressed (cosmetic remainder non-blocking). See `AUDIT_REMEDIATION_COMPLETE.md`.

---

## Wave History

| Wave | Date | Agents | Status |
|------|------|--------|--------|
| F1 | 2026-07-06 | A: EventHistory, B: Write-path hooks, C: ExecutePanel, D: Chat throttle, E: PaymentPanel TS | ✅ Verified (typecheck + build) |
| F2 | 2026-07-06 | A: AgentDetail gates, B: Event WS merge, C: OrchestratorTick, D: Chat IDs, E: QueryClient, F: Chain writes | ✅ Verified (typecheck + build) |
| F3 | 2026-07-06 | A: ui primitives, B: PaymentPanel, C: ExecutePanel, D: TradeHistory, E: ChatPage chain, F: TransferModal | ✅ Verified (typecheck + build) |
| F4 | 2026-07-06 | A: AgentDetail a11y, B: resetPay, C: vault batch, D: App focus+routes, E: wagmi, F: Chat extract+apiFetch | ✅ Verified (typecheck + build) |
| F5 | 2026-07-06 | A–H: guards, hooks, pages, App menu | ✅ Verified (typecheck + build) |

---

## Critical (Phase 0 — Wave F1)

| ID | Finding | Microchange | Status | Agent | Evidence |
|----|---------|-------------|--------|-------|----------|
| C-1 / P0-1 | Event history lost on incremental poll | Merge/dedupe events in `useEventHistory` by `chainId:txHash:logIndex`; cap at MAX_EVENTS | Done | F1-A | `fix_wave_20260706_f1.md`; `useEventHistory.ts:38-134` |
| C-2 / P0-2a | `useDeposit` omits `chainId` on vault address | `useChainId()` → `getAxiomStrategyVaultAddress(chainId)` | Done | F1-B | `useDeposit.ts:12-15` |
| C-2 / P0-2b | `useTransfer` omits `chainId` on NFT address | `useChainId()` → `getAxiomAgentNftAddress(chainId)` | Done | F1-B | `useTransfer.ts:50-51,147,213` |
| C-2 / P0-2c | `usePayment` omits `chainId` on processor address | `useChainId()` → `getAxiomPaymentProcessorAddress(chainId)` | Done | F1-B | `usePayment.ts:62-63,77` |
| C-3 / P0-3a | Conditional `useAgents()` in ExecutePanel | Unconditional `useAgents()`; gate usage in JSX | Done | F1-C | `ExecutePanel.tsx:174-175` |
| C-4 / P0-3b | `useCallback` after early return | Move all hooks before `if (!isConnected) return` | Done | F1-C | `ExecutePanel.tsx:240-285` |
| H-14 / P0-2d | ExecutePanel tick uses chain-unaware addresses | `useChainId()` on vault/agentNft in tick payloads | Done | F1-C | `ExecutePanel.tsx` tick payloads |
| C-5 / P0-4 | Chat SSE per-token re-renders | Throttle `setStreamText` (50ms) via ref | Done | F1-D | `ChatPage.tsx` throttle refs |
| C-6 | AgentDetail eager hooks on mount | Gate hooks by `activeSection` + `enabled` | Done | F2-A | `fix_wave_20260706_f2.md`; `AgentDetail.tsx` |

---

## High (Phase 1+)

| ID | Finding | Microchange | Status | Agent |
|----|---------|-------------|--------|-------|
| H-1 | Dual COLORS vs CSS variables | COLORS values → `var(--c-*)` bridge | Done | F3-A | `ui.tsx` COLORS |
| H-2 | Definition-list grid copy-pasted 3× | `DefinitionList` in PaymentPanel + ExecutePanel | Done | F3-B,C | `fix_wave_20260706_f3.md` |
| H-3 | PaymentForm ≈ RoyaltySection duplicate | `NumericActionRow` | Done | F3-B | `PaymentPanel.tsx` |
| H-4 | ChatPage 1,178-line monolith | Tools → `chat/tools.ts` (703 LOC page) | Done | F4-F | `fix_wave_20260706_f4.md` |
| H-5 | Message list index as React key | Stable message IDs | Done | F2-D | `ChatPage.tsx` message.id |
| H-6 | AgentDetail tabs lack ARIA tab pattern | `role=tablist/tab/tabpanel` | Done | F4-A | `AgentDetail.tsx` |
| H-7 | WS events discarded; HTTP refetch storm | Merge WS in `useAgentEvents` | Done | F2-B | `useAgentEvents.ts` |
| H-8 | `useOrchestratorTick` WS lifecycle gaps | onclose/timeout handling | Done | F2-C | `useOrchestratorTick.ts` |
| H-9 | `wagmi.ts` localStorage read once at init | `WagmiConfigProvider` + `createWagmiConfig()` | Done | F4-E | `config/WagmiConfigProvider.tsx` |
| H-10 | `usePayment.resetPay` no-op | Wire reset to wagmi mutation | Done | F4-B | `usePayment.ts` |
| H-11 | Vault batch vs single failure semantics | `readError` per entry + aggregate error | Done | F4-C | `useVaultDataBatch.ts` |
| H-12 | Event tokenId filter misses payload keys | Wire `eventTokenId` from utils | Done | F2-B | `useAgentEvents.ts` |
| H-13 | Dual AbortController in orchestrator tick | Consolidate abort | Done | F2-C | `useOrchestratorTick.ts` |
| P1-6 | QueryClient defaults | staleTime, refetchOnWindowFocus, retry | Done | F2-E | `main.tsx` |
| H-15 | ChatPage raw `fetch` not `apiFetch` | `apiFetchResponse` for SSE | Done | F4-F | `apiFetch.ts` |
| H-16 | Inline styles vs utilities (hot paths) | Partial via shared primitives | Done | F3 | DefinitionList/NumericActionRow |
| H-17 | Chat lazy chunk pulls full tool registry | Archive tools dynamic import | Done | F4-F | `chat/tools.ts` |
| H-18 | Shortcut overlay missing focus trap | Focus trap in ShortcutHelp | Done | F4-D | `App.tsx` |
| H-19 | ConnectedGuard repeated per page | `WalletRoute` on 3 routes | Done | F4-D | `App.tsx` (child cleanup optional) |
| P3-5 | resetPay | Same as H-10 | Done | F4-B | |
| P3-6 | Wire utils/events.ts | Wired in F2-B | Done | F2-B | `useAgentEvents.ts` |
| C-2-ext | MintForm/PaymentPanel chain-unaware writes | `useChainId()` on all write paths | Done | F2-F | MintForm + PaymentPanel |
| C-2-ext-b | ChatPage chain-unaware writes | `useChainId()` on tool write paths | Done | F3-E | `ChatPage.tsx` ToolContext |
| P2-4 | Textarea in TransferModal | `Textarea` from ui.tsx | Done | F3-F | `TransferModal.tsx` |
| P2-5 | ConnectedGuard in ExecutePanel | Wrapped panel content | Done | F3-C | `ExecutePanel.tsx` |
| P2-6 | Shared getActionColor | ExecutePanel + TradeHistory | Done | F3-C,D | `ui.tsx` export |

*Full SA1 (28), SA2 (32), SA3 (34) enumerations tracked in sub-agent reports.*

---

## Medium / Low / Cosmetic (~63)

Tracked in sub-agent appendices. Remediation scheduled Phases 2–3 after Critical/High complete.

---

## Verification Commands (per wave)

```bash
pnpm --filter @axiom/frontend typecheck
pnpm --filter @axiom/frontend build
```

---

*Orchestrator does not edit source files. Agents update Status + Evidence columns on completion.*