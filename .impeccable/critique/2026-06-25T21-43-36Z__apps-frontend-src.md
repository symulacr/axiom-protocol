---
target: all pages
total_score: 28
p0_count: 0
p1_count: 0
p2_count: 0
p3_count: 4
timestamp: 2026-06-25T21-43-36Z
slug: apps-frontend-src
---
# Design Critique: Axiom Protocol Frontend (Re-run)

**Target:** All frontend pages (`apps/frontend/src`)
**Date:** 2026-06-25
**Register:** product (dashboard, agent management, vault controls)
**Previous score:** 23/40 (Acceptable)

---

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Good skeleton/error states; real-time agent status could be more prominent |
| 2 | Match System / Real World | 3 | DeFi jargon is domain-appropriate; ConnectedGuard copy now helpful |
| 3 | User Control and Freedom | 3 | Cancel on streaming, modal cancel/back, error page back links |
| 4 | Consistency and Standards | 4 | COLORS aligned to DESIGN.md, components used consistently, tokens everywhere |
| 5 | Error Prevention | 3 | Deposit/withdraw validation with inputMode, disabled states on invalid input |
| 6 | Recognition Rather Than Recall | 3 | Text labels alongside color signals, "Up/Down" on health badges |
| 7 | Flexibility and Efficiency | 1 | No keyboard shortcuts; no batch actions; structural, not a quick fix |
| 8 | Aesthetic and Minimalist Design | 4 | Card-in-card removed, warm palette, consistent tokens, teal accent active |
| 9 | Error Recovery | 3 | Clear errors with retry; some jargon leaks in MintForm |
| 10 | Help and Documentation | 1 | No contextual help or tooltips; structural, not a quick fix |
| **Total** | | **28/40** | **Good — address weak areas, solid foundation** |

**Previous:** 23/40 → **Current:** 28/40 (+5 points)

---

## Anti-Patterns Verdict

**Does this look AI-generated?** No longer obvious. The warm-tinted neutrals (#10100e, #1c1a17, #2d2a25) differentiate from the cold-gray DeFi template. The teal secondary accent adds a second color voice. The instrument-panel density and monospace-for-data pattern create a distinctive identity.

**Deterministic scan:** 2 warnings (Inter font, acceptable for product UI where familiarity is a feature). No other anti-patterns detected.

**Fixes verified:**
- COLORS drift: resolved. All values match DESIGN.md warm-tinted palette.
- Mixed styling: resolved. All pages use component library (Input, Button, Card).
- Color-only signals: resolved. HealthBadge shows "Up ✓"/"Down ✗". Leaderboard shows "High"/"Medium"/"Low". AgentDetail shows "Up ✓"/"Down ✗".
- Card-in-card: resolved. ChatPage messages are plain divs with bottom borders.
- Empty states: resolved. VaultDashboard, AgentDetail, AgentsBrowser, MarketPage all have empty states.
- Deposit validation: resolved. inputMode="decimal", isValidDeposit check, disabled on invalid.

---

## Overall Impression

The interface now reads as "Axiom" rather than "dark-mode DeFi template." The warm-tinted palette, teal counterpoint, and consistent component usage create a cohesive identity. The foundation is solid. The remaining gaps (keyboard shortcuts, contextual help) are structural investments, not polish bugs.

---

## What's Working

1. **Warm palette identity.** The obsidian/bronze/teal system is distinctive. Neutrals lean warm without reading as "cream." The teal accent on informational links and data creates visual variety without competing with bronze.

2. **Component consistency.** Every page now uses the shared library. No raw `<input>`, no inline-styled links pretending to be buttons. The design system actually governs the UI.

3. **Accessible color signals.** Every color-coded element has a text label: "Up ✓"/"Down ✗" on health, "High"/"Medium"/"Low" on scores, "BUY"/"SELL"/"HOLD" on recommendations. Color enhances meaning, never replaces it.

---

## Remaining Issues

### [P3] ChatPage raw input — cosmetic
The chat input uses the `Input` component now, but the chat-specific styling (flex: 1, larger padding) creates a slightly different visual treatment than other inputs. Acceptable for a specialized surface, but worth noting.

### [P3] No keyboard shortcuts — structural
No keyboard shortcuts anywhere. Power users (Alex persona) will find the interface slow. This is a feature investment, not a polish fix.

### [P3] No contextual help — structural
No tooltips, guided tours, or inline help. First-time users (Jordan persona) hit domain jargon without explanation. This is a content/IA investment.

### [P3] SectionTitle eyebrow pattern
`SectionTitle` uses `text-transform: uppercase` with `0.08em` tracking. Used sparingly (one per section) it's acceptable. If every section had one, it would be the AI eyebrow tell.

---

## Persona Red Flags (Updated)

**Alex (Power User):** Still no keyboard shortcuts or batch actions. The interface is functional but not fast. This is the biggest remaining gap for expert users.

**Sam (Accessibility):** Color signals now have text labels. HealthBadge, leaderboard, and recommendations are all accessible. The chat still lacks `aria-live` for new messages, but the core flows are navigable.

**Riley (Stress Tester):** Empty states now handle the zero-data case. Deposit validation prevents invalid input. The remaining edge: what happens with 1000 events in EventTimeline? Still renders all of them.

---

> **Trend for `apps-frontend-src` (last 5 runs):** 23 → 28
> Wrote `.impeccable/critique/2026-06-25T22-00-00Z__apps-frontend-src.md`.
