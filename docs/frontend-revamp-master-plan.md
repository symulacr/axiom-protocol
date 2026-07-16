# Axiom Frontend Revamp — Master Plan (Production)

**Sources:** 3 parallel specialist agents (IA, Visual/3D, Pages/roadmap) + codebase at `/home/eya/og/apps/frontend`  
**Goal:** Premium cyber-finance operator UI people **use daily** (mint → fund → tick → transfer → chat), not a brochure site.  
**Honesty:** Simulated software TEE oracle, Aristotle `16661`, ticks settle only with Merkle `executionPlan`.

---

## 1. Executive vision

**Ownable AI agents, sealed on-chain** — a dark glass terminal over 0G: LCD data readouts, indigo brand accents, mint phosphor for live status only. Hierarchy is **portfolio → agent console → market/chat**. Every primary CTA either submits a wallet tx, calls backend/oracle, or deep-links to a screen that does.

**Non-negotiables**
- No duplicated metrics with competing formulas (one performance model, one vault SSoT).
- No “hardware enclave” marketing.
- 3D is optional theater (landing/agent identity only); product paths stay 2D and fast.
- TanStack Query as product cache + invalidation after mutations.

---

## 2. Information architecture (no duplication)

### Target routes

| Route | Owns | Does not own |
|-------|------|--------------|
| `/` | Marketing + honest product loop | Ops data |
| `/app` | **Dashboard** — portfolio KPIs, next actions, compact agents | Full market/list mashup |
| `/agents` | Directory only | Deposit/execute panels |
| `/agents/new` | Mint wizard + post-mint checklist | — |
| `/agents/:id` | Agent workspace tabs | Global market tape |
| `/market` | Providers, transfers, activity ranks | Per-agent vault |
| `/chat` | NL ops, same agent selection | Second registry |
| `/settings` | Health detail, network (future) | Agent ops |

### Single sources of truth

| Fact | Query / source | Primary UI | Elsewhere |
|------|----------------|------------|-----------|
| Vault 0G | chain vault multicall | Capital / Vault tab | chips only |
| Oracle/backend | `GET /health` | Shell badge | Settings, never competing story |
| Performance | `/performance` + batch | Performance tab | list chip from batch only |
| Agent list | `GET /v1/agents` | `/agents` | dashboard compact |
| Selection | URL + one storage key | shell chip | chat/execute |

### Kill list (current bugs)

- `HomePage` embedding full `AgentsBrowser` + `MarketPage`
- Dual oracle rows (header + agent detail)
- Market activity score vs performance batch as “PnL”
- Split selection: `axiom:lastAgent` vs chat sessionStorage

---

## 3. Design system (cyber-luxury)

**Personality:** “Sealed terminal, not casino neon.”

| Token role | Direction |
|------------|-----------|
| Page | Void `#07070f` |
| Surface | Glass `rgba(16,16,32,.72)` + blur |
| Brand | Indigo `#3d3dff` (keep `--c-bronze*` aliases) |
| Live | Phosphor mint `#3dff9a` (status only) |
| LCD | Near-black + mono mint digits |
| Radius | 4–16px (leave pure 0px Atlas) |
| Depth | L0 solid · L1 glass · L2 elevated |

**Components:** extend `Card` with `depth` / `variant="glass|lcd|solid"`; hover preview strips on agent rows; honest amber “Software TEE” chips.

**Three.js (Phase 3):** lazy `HeroScene` on landing + optional `AgentOrb` on detail; DPR cap 1.5; one WebGL context; reduced-motion → SVG.

**AI image prompts (hero/OG):** void glass seal; iNFT lattice portrait; Merkle nodes; re-key keys; LCD readout; market atmosphere — no robot mascots, no fake TDX stickers.

---

## 4. Page before → after (summary)

| Surface | Before | After |
|---------|--------|-------|
| Landing | TEE overclaim, static | Honest stack, product loop CTAs, optional status strip |
| Dashboard | List+market mashup | Stats, action rail, compact agents, needs-attention, activity |
| Agents | Dense rows | Sort/filter, preview hover, clear Open/Tick |
| Mint | 3 steps, sparse UX | Stepper + TxProgress + post-mint checklist |
| Agent detail | Overview dump | Tabs: Overview · Vault · Execute · Payments · Activity · Performance |
| Market | Tourist-empty without wallet | Honest activity score, agent links |
| Chat | Strong but no agent chip | Context picker + structured tool cards |
| Shell | No Mint nav | Mint CTA + ConnectPrompt + chain banner |

---

## 5. Stack

| Keep | Add carefully |
|------|----------------|
| Vite, React 18, RR7, wagmi, RainbowKit, Query, sonner, CSS tokens | CSS enhancements first |
| Existing hooks | Phase 2: extract AgentRow, VaultCommandCenter |
| — | Phase 3: optional R3F lazy; framer only if needed |

**Avoid:** dual Tailwind+inline chaos, Three on `/app` critical path.

---

## 6. Phased roadmap

| Phase | Focus | Dev-days | Exit |
|-------|-------|----------|------|
| **1** | Tokens dark glass, real dashboard, landing honesty, shell Mint/connect | 8–12 | mint→deposit path without blank forms |
| **2** | Agent console tabs, vault/tick/transfer polish, market/chat | 10–14 | daily operator UX |
| **3** | Motion, a11y, optional 3D hero | 6–10 | LCP not regress >10% |

---

## 7. Implementation order (execute now)

1. ~~Master plan~~  
2. **Phase 1 code:** dark tokens + dashboard + landing honesty + shell polish  
3. Phase 2 agent workspace  
4. Phase 3 polish/3D  

See also agent reports in session: IA, Visual, Pages specialists.
