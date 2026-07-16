# Frontend phases todo (execution tracker)

| Phase | Scope | Status |
|-------|--------|--------|
| **1** | Dark design system, real dashboard, ConnectGuard, Mint nav, landing honesty | **Done** |
| **2** | Agent detail Vault section grouping, capital hierarchy | **Done** (Vault & capital card) |
| **3** | Agents search (⌘K), market remains; nav Axiom rename | **Done** (search already; branded nav) |
| **4** | LLM branded **Axiom**; system prompt; chat UI; prompts include mint | **Done** |
| **5** | Backend `/v1/config` `assistantName: Axiom`; mint tool hints; tool catalog | **Done** |
| **6** | Automated unit/typecheck; Chrome click QA | **Done** |

## Phase 6 Chrome QA checklist (2026-07-16)

- [x] `/` landing loads, CTAs work
- [x] `/app` dashboard + Connect Wallet gate
- [x] Nav: Dashboard · Agents · Market · **Axiom** · Mint
- [x] `/agents` navigates
- [x] `/agents/new` mint route
- [x] `/market` providers/transfers/leaderboard empty states
- [x] `/chat` wallet gate (chat needs connect)
- [x] Fixed crash: truncated `VITE_MOCK_USDC_ADDRESS` + getAddresses requiring mockUsdc
- [ ] Live LLM round-trip (needs backend + compute API keys + wallet)

## Functional tools (catalog)

All tools from `CHAT_TOOL_CATALOG` are registered in FE `TOOLS` + `runBrowserTool` → `runTool`.  
Mint: `mint_agent` → encode + oracle register + wallet sign.
