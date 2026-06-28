---
target: all pages
total_score: 35
p0_count: 0
p1_count: 0
p2_count: 0
p3_count: 3
timestamp: 2026-06-25T23-33-42Z
slug: apps-frontend-src
---
# Design Critique: Axiom Protocol Frontend (Final)

**Target:** All frontend pages (`apps/frontend/src`)
**Date:** 2026-06-25
**Register:** product (dashboard, agent management, vault controls)
**Previous scores:** 23/40 → 28/40

---

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Skeleton states, error alerts with retry, aria-live chat, health badge with text labels |
| 2 | Match System / Real World | 3 | DeFi jargon is domain-appropriate; HelpTip on complex terms; glossary footer |
| 3 | User Control and Freedom | 4 | Keyboard shortcuts (G/M/C/N/⌘K/?), Escape closes modals, cancel on streaming, Enter to submit |
| 4 | Consistency and Standards | 4 | Full token system, components everywhere, explicit transitions, semantic HTML |
| 5 | Error Prevention | 4 | Input validation, maxLength, inputMode, disabled on invalid, double-submission guards |
| 6 | Recognition Rather Than Recall | 4 | Text labels on all color signals, HelpTip on domain terms, shortcut hints in nav |
| 7 | Flexibility and Efficiency | 2 | Keyboard shortcuts now exist; still no batch actions (structural, contract-limited) |
| 8 | Aesthetic and Minimalist Design | 4 | Warm palette, sentence-case titles, no decorative blur, no eyebrow pattern |
| 9 | Error Recovery | 3 | Clear errors with retry; some jargon leaks in MintForm |
| 10 | Help and Documentation | 3 | HelpTip tooltips, glossary footer, ? shortcut overlay, contextual placeholders |
| **Total** | | **35/40** | **Excellent — minor polish only** |

**Previous:** 28/40 → **Current:** 35/40 (+7 points)

---

## Anti-Patterns Verdict

**Does this look AI-generated?** No. The warm-tinted palette, sentence-case section titles, bronze/teal identity, instrument-panel density, and monospace-for-data pattern are distinctive. No gradient text, no glassmorphism, no eyebrows, no card grids, no bounce easing.

**Detector:** 2 warnings (Inter font, acceptable for product UI).

---

## What Changed Since Last Critique

**Quieter pass:**
- PageHeader weight 700 → 600
- MonoLabel/Alert backgrounds reduced (8% → 5%)
- Nav keyboard hints: smaller, dimmer

**Harden pass (overflow):**
- Card, Alert, PageHeader, MonoLabel, Modal: overflow protection
- AgentDetail metadata grid: min-width + overflow containment
- AgentsBrowser: agent names truncate with ellipsis

**Harden pass (performance):**
- Search debounce (200ms)
- EventTimeline: 50-event limit
- MarketPage: 20-item transfer limit

**Harden pass (forms):**
- maxLength on all inputs (name, address, pubkey, amount, chat)
- inputMode on numeric inputs
- Double-submission guards

**Optimize pass:**
- CSS containment on Card and main content
- Font preload for Inter
- Explicit transitions (zero `transition: all` remaining)
- Removed decorative `backdrop-filter` from header

**Audit-driven hardening:**
- `aria-live="polite"` + `role="log"` on chat
- Form labels on deposit/withdraw/chat inputs
- `<main>` landmark replaces `<div>`
- Single h1 per page
- Auto-fit grids on MarketPage
- 44px touch targets on nav links
- Keyboard-accessible Card hover (tabIndex, Enter/Space)

**Adapt pass:**
- Tablet breakpoint at 768px
- `.stack-on-mobile` now triggers at 768px (covers tablets)
- Touch query: `@media (pointer: coarse)` for 44px min-height
- `viewport-fit=cover` for safe-area support

**Command palette:**
- G/M/C/N keyboard navigation
- ⌘K search focus
- ? shortcut help overlay
- `<kbd>` hints in nav

**Help system:**
- HelpTip component on domain terms
- Key Terms glossary footer
- Contextual placeholders

---

## Remaining Issues

### [P3] No batch actions — structural
Smart contracts don't batch. This is a protocol limitation, not a UI gap.

### [P3] Single Inter font — acceptable
Familiarity is a feature for product UI. A distinctive font would add personality but risks readability.

### [P3] HelpTip title-only — minor
`title` attribute works for most users. `aria-describedby` would be better for screen readers.

---

## Positive Findings

- **Full token system**: Zero hard-coded hex in pages. Warm-tinted throughout.
- **Comprehensive a11y**: Skip link, focus-visible, aria-live, landmarks, keyboard shortcuts, form labels, touch targets.
- **Performance**: Explicit transitions, CSS containment, font preload, list limits, search debounce.
- **Responsive**: Auto-fit grids, tablet breakpoint, touch queries, safe-area support.
- **Help**: HelpTip tooltips, glossary, shortcut overlay, contextual placeholders.
- **Keyboard**: G/M/C/N navigation, ⌘K search, ? help, Escape close, Enter submit.

---

> **Trend for `apps-frontend-src`:** 23 → 28 → 35
> Wrote `.impeccable/critique/2026-06-25T23-00-00Z__apps-frontend-src.md`.
