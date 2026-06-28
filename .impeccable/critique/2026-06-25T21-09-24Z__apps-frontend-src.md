---
target: all pages
total_score: 23
p0_count: 0
p1_count: 2
p2_count: 3
p3_count: 1
timestamp: 2026-06-25T21-09-24Z
slug: apps-frontend-src
---
# Design Critique: Axiom Protocol Frontend

**Target:** All frontend pages (`apps/frontend/src`)
**Date:** 2026-06-25
**Register:** product (dashboard, agent management, vault controls)

---

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Good skeleton/error states; real-time agent status could be more prominent |
| 2 | Match System / Real World | 2 | DeFi jargon without explanation ("strategy root", "Merkle proof", "daily limit"); domain terms assumed |
| 3 | User Control and Freedom | 2 | No undo for deposits/transfers; chat has no clear escape; no cancel on long-running executions |
| 4 | Consistency and Standards | 2 | COLORS drift from DESIGN.md; mixed className/inline styling; raw HTML where components exist |
| 5 | Error Prevention | 2 | Deposit input lacks numeric validation; no confirmation on destructive transfers; fee box same color as page bg |
| 6 | Recognition Rather Than Recall | 2 | Icon-only buttons in places; payments hidden in `<details>`; no contextual help or tooltips |
| 7 | Flexibility and Efficiency | 1 | No keyboard shortcuts; no batch actions; no power-user path; one-item-at-time workflows |
| 8 | Aesthetic and Minimalist Design | 3 | Clean dark theme, restrained accent; card-in-card in ChatPage; some visual noise from style inconsistency |
| 9 | Error Recovery | 3 | Clear error messages with retry; some technical jargon leaks; duplicate error sources in MintForm |
| 10 | Help and Documentation | 1 | No contextual help, tooltips, guided tours, or searchable docs; "Connect your wallet" is not help |
| **Total** | | **23/40** | **Acceptable — significant improvements needed** |

---

## Anti-Patterns Verdict

**Does this look AI-generated?** Partially. The dark theme with bronze accent is a known DeFi template pattern, but the instrument-panel density and warm-tinted neutrals (once updated from DESIGN.md) would differentiate it. The current COLORS object uses cold grays (#8a8a8a, #6a6a6a, #2a2a2a) that read as generic dark-mode DeFi.

**Deterministic scan** found 2 warnings:
- `overused-font` (Inter) in `styles/index.css:57` and `:121` — Inter is the most-converged AI font. For a product UI where familiarity is a feature (per product register), this is acceptable but worth noting. A distinctive body font would add personality.

**Additional detector-adjacent findings from source review:**
- No gradient text, side-stripe borders, or nested cards detected in most pages
- ChatPage has card-in-card-in-card (messages wrapped in Cards inside a scrollable Card)
- No emoji in production copy (ChatPage tool_call display uses 🔥🔧 — crypto-bro adjacent)

---

## Overall Impression

The foundation is solid: consistent component library, proper loading/error states, clean routing. The interface does its job. But it reads as "well-built dark-mode DeFi template" rather than "Axiom." The biggest opportunity is closing the gap between DESIGN.md (warm, textured, bronze-and-teal) and the actual COLORS object (cold, flat, bronze-only). The second biggest opportunity is consistency: half the pages use the component library properly, the other half use raw HTML with inline styles.

---

## What's Working

1. **Component library design.** The `ui.tsx` components (Button, Card, Input, Alert, Modal, MonoLabel) are well-structured with proper variants, transitions, and disabled states. The Modal uses native `<dialog>` correctly. This is a strong foundation.

2. **Loading and error states.** Most pages have proper skeleton loading, ErrorAlert with retry, and ConnectedGuard for wallet-gated content. VaultDashboard, AgentDetail, and MarketPage all handle the loading → error → data pipeline correctly.

3. **Accessibility foundations.** Skip link, focus-visible rings, ARIA labels on interactive elements, `role="alert"` on error states, `aria-expanded` on mobile menu. The basics are in place.

---

## Priority Issues

### [P1] COLORS drift from DESIGN.md
**What:** The `COLORS` object in `ui.tsx` uses values that don't match the new DESIGN.md: `bg: '#0f0f0f'` (should be `#10100e`), `surface: '#1a1a1a'` (should be `#1c1a17`), `textMuted: '#8a8a8a'` (should be `#9a9288`), `textDim: '#6a6a6a'` (should be `#736b62`), `border: '#2a2a2a'` (should be `#2d2a25`). Missing: teal (`#5a8a8a`), parchment (`#f0ebe3`), Alert info variant.

**Why it matters:** The DESIGN.md defines a warm, textured palette. The actual code uses cold grays. Every page inherits this mismatch. The "warm instrument panel" identity doesn't materialize.

**Fix:** Update `COLORS` and CSS custom properties to match DESIGN.md. Add teal and parchment tokens. Add Alert info variant.

**Suggested command:** `$impeccable colorize apps/frontend`

---

### [P1] Mixed styling approach across pages
**What:** Some pages use the component library (`Card`, `Button`, `Input`, `SectionTitle`) properly. Others use raw HTML with inline styles: `AgentsBrowser` uses raw `<input>` instead of `<Input>`, `ExecuteStrategyPage` has unstyled `<h1>` and `<p>`, `NotFound` uses hardcoded `#0f0f0f` on a link instead of a Button, `MarketPage` uses raw `<li>` with grid styles instead of Cards.

**Why it matters:** Inconsistent styling means the design system isn't actually governing the UI. Users see different visual treatments for the same type of element across pages.

**Fix:** Migrate all pages to use the component library. Replace raw `<input>` with `<Input>`, raw links with `<Button>`, raw lists with `<Card>`. Remove inline style duplication.

**Suggested command:** `$impeccable polish apps/frontend`

---

### [P2] Color-only semantic signals
**What:** `ExecutePanel` uses green/red/muted color for buy/sell/hold recommendations with no text label. `HealthBadge` uses color-only dots for status. `MarketPage` leaderboard uses color-only score indicators.

**Why it matters:** Color-blind users (8% of men) cannot distinguish these states. Also violates WCAG 1.4.1 (Use of Color). The DESIGN.md rule says "Color is never the only signal."

**Fix:** Add text labels alongside color indicators. "BUY" in green, "SELL" in red, "HOLD" in pewter. Health: "Healthy" / "Degraded" text next to the dot.

**Suggested command:** `$impeccable clarify apps/frontend`

---

### [P2] Card-in-card pattern in ChatPage
**What:** Chat messages are rendered as `<Card>` components inside a scrollable `<div>` that is itself styled as a card-like container. Tool calls display emoji (🔥, 🔧) and are wrapped in their own Card. The result is nested card borders and backgrounds.

**Why it matters:** DESIGN.md says "No nested cards. A card inside a card is always wrong." The visual noise makes the chat feel cluttered. The emoji reads as crypto-bro adjacent.

**Fix:** Remove the outer card wrapper. Use a flat scrollable area with subtle dividers between messages. Replace emoji with text labels or monospace icons.

**Suggested command:** `$impeccable distill ChatPage`

---

### [P2] Missing empty states and progressive disclosure
**What:** `VaultDashboard` shows no guidance when deposits are zero. `AgentDetail` conditionally renders the Activity section with no empty state. `AgentPaymentsPage` shows an invalid agent with no back link or guidance. `ExecuteStrategyPage` has minimal error state for invalid tokens.

**Why it matters:** Empty states are teaching moments. A blank area with no guidance tells the user "nothing exists" instead of "here's what you can do." First-time users hit these states immediately.

**Fix:** Add empty state cards with CTAs: "No deposits yet. Fund your vault to start." with a deposit button. "No activity yet. Execute a strategy to see results here." Add back links on error pages.

**Suggested command:** `$impeccable onboard apps/frontend`

---

### [P3] Deposit input lacks numeric validation
**What:** The deposit input in `VaultDashboard` accepts any text. No `type="number"`, no `min`, no `step`, no validation against available balance.

**Why it matters:** Users can submit "abc" or negative numbers. The transaction will fail on-chain, wasting gas and confusing the user.

**Fix:** Add `type="number"`, `min="0"`, `step="any"`. Validate against connected wallet balance before enabling the submit button.

**Suggested command:** `$impeccable harden apps/frontend`

---

## Persona Red Flags

**Alex (Power User):** No keyboard shortcuts anywhere. Depositing requires: navigate to vault → type amount → click deposit → confirm in wallet → wait. No batch deposit, no quick-action from the agents list. The chat has no keyboard shortcut to send (Enter works, but no Cmd+Enter for newline vs send distinction). Alex will find the interface slow.

**Sam (Accessibility-Dependent):** Color-only indicators (health dots, buy/sell/hold, leaderboard scores) are invisible to screen reader users. The chat has no `aria-live` region, so new messages aren't announced. Tool call displays use emoji without text alternatives. The `<details>` element for payments is accessible but undiscoverable without a screen reader hint. Sam can navigate but misses critical semantic content.

**Riley (Stress Tester):** What happens when an agent has 1000 events? The EventTimeline renders all of them. What happens with a 200-character agent name? The AgentDetail page will overflow. What happens if the backend returns an empty array vs null vs undefined? The hooks handle some cases but the UI doesn't distinguish "loading" from "empty" consistently. Riley will find the edges.

---

## Minor Observations

- `SectionTitle` uses `text-transform: uppercase` with `letter-spacing: 0.08em`. This is the "tiny uppercase tracked eyebrow" pattern the skill flags as an AI tell. Used sparingly (one per section) it's acceptable, but if every section has one, it's the pattern.
- The `MonoLabel` component uses a hardcoded monospace font stack (`'SF Mono', 'Fira Code', 'JetBrains Mono'`) that matches the CSS variable but is duplicated. Should reference `var(--font-mono)` if defined.
- `HealthBadge` uses a hardcoded `#4ade80` green that doesn't match Signal Green (`#6b9e6b`). Inconsistent semantic color.
- The `axiom-pulse` animation in CSS uses `opacity: 0.6 → 1` which is fine, but there's no `prefers-reduced-motion` override for it (only `axiom-fade-in` has one).
- `ConnectedGuard` shows "Connect your wallet to view this content" — could be more helpful: "Connect your wallet to view agents, manage vaults, and execute strategies."

---

## Questions to Consider

- The COLORS mismatch is the single highest-leverage fix: updating 12 values in one file warms the entire UI. Should this be the first pass?
- ChatPage is the most complex surface (306 lines, streaming, tool calls, SSE). Should it get its own dedicated `$impeccable shape` pass before polish?
- The component library is strong but underutilized. Should a migration pass (raw HTML → components) happen before or after the color update?

---

## Run Notes

- **Target slug:** `apps-frontend-src`
- **Ignore list:** not found (no `.impeccable/critique/ignore.md`)
- **Assessment independence:** degraded (sequential; sub-agent used for Assessment A, detector for Assessment B)
- **CLI detector:** 2 findings (overused-font ×2)
- **Browser visualization:** skipped (dev server on :8080 but browser automation not used for multi-page critique)
- **Overlay injection:** skipped
- **Live server cleanup:** n/a
- **Temp file cleanup:** n/a
