# Frontend phases todo (execution tracker)

| Phase | Scope | Status |
|-------|--------|--------|
| **1** | Dark design system, real dashboard, ConnectGuard, Mint nav, landing honesty | **Done** |
| **2** | Agent detail Vault section grouping, capital hierarchy | **Done** (Vault & capital card) |
| **3** | Agents search (⌘K), market remains; nav Axiom rename | **Done** (search already; branded nav) |
| **4** | LLM branded **Axiom**; system prompt; chat UI; prompts include mint | **Done** |
| **5** | Backend `/v1/config` `assistantName: Axiom`; mint tool hints; tool catalog | **Done** |
| **6** | Automated unit/typecheck; manual Chrome QA checklist | **In progress** |

## Phase 6 Chrome QA checklist

- [ ] `/` landing loads, CTAs work
- [ ] `/app` dashboard stats + Mint / Browse / Chat / Market
- [ ] Connect wallet control visible when disconnected
- [ ] `/agents` search filters list (⌘K focuses search)
- [ ] `/agents/new` mint wizard steps
- [ ] `/agents/:id` vault deposit/withdraw visible
- [ ] `/market` loads providers/transfers
- [ ] `/chat` shows **Axiom**, can send message (needs live compute + keys)
- [ ] Chat tool: list agents / mint (wallet) / vault balance

## Functional tools (catalog)

All tools from `CHAT_TOOL_CATALOG` are registered in FE `TOOLS` + `runBrowserTool` → `runTool`.  
Mint: `mint_agent` → encode + oracle register + wallet sign.
