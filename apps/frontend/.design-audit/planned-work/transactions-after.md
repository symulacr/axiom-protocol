# Transactions · AFTER planned work

Source surfaces: `src/pages/TransactionsPage.tsx`, `src/components/axiom/Controls.tsx` (`PageHead` / `Button` / `PanelHead`), `src/components/StatePill.tsx`, `src/components/MobileDisclosure.tsx`.

Mirror of the BEFORE markup in `apps/frontend/.design-audit/dashboard-transactions-before-after.html`. All changes below are CSS-only and token-faithful — they consume the existing `--completion-*` ladder, never invent new tokens.

---

## 1. Ops summary band (`.ops-summary`)

**Current** — `display:grid; gap:1px; border:1px solid var(--line); background:var(--line)` with three columns: confirming-now, recovery CTA, note. The 1px gap between cells shows through because the parent background is `var(--line)` — reads as a utilitarian grid.

#### Planned

- Convert to a **rounded card stack** with `gap:14px`, `border:0`, transparent background. Each child becomes its own surface.
- Each `.ops-summary > div` and `.ops-summary > button` gains `padding:18px 22px`, `background:linear-gradient(180deg, var(--panel-2), var(--panel))`, `border:1px solid var(--line)`, `border-radius:var(--radius-lg)`.
- Hover lift on each card: `transform:translateY(-2px)`, copper-tinted border.
- `.ops-summary-value` (the big "01" / "02" number) bumps from 18px Syne to **26px Syne 700 tabular**.
- `.ops-summary-recovery` keeps its copper-bright color on the value but loses its absolute-positioned arrow — the arrow now sits at the end of the row via `margin-left:auto; align-self:end` (cleaner flow).
- The note cell keeps the phosphor icon but gains a tighter inner rhythm (`line-height:1.5`).

**Risk** — Low. CSS-only. Hover behavior is decorative.

---

## 2. Filter chips (`.filters` + `.filter`)

**Current** — flat 8px-padded text buttons with a 2px transparent bottom border. The active state swaps color + paints the bottom border copper. Reads as "tab strip" rather than "active selection".

#### Planned

- Convert to **pill-shaped chips** with `border:1px solid var(--line)` + `border-radius:999px` + `padding:6px 12px`.
- Active state: copper filled background:
  ```css
  background: color-mix(in srgb, var(--copper) 18%, transparent);
  border-color: var(--copper);
  color: var(--copper-bright);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--copper) 25%, transparent);
  ```
- Hover state: copper-tinted background + copper border:
  ```css
  background: color-mix(in srgb, var(--copper) 8%, transparent);
  border-color: color-mix(in srgb, var(--copper) 50%, var(--line));
  ```
- Bottom-border-on-active pattern is removed entirely; the pill background carries the selection.
- `letter-spacing` tightens from `.06em` to `.04em` to balance the chip weight.
- The `More filters` trigger keeps its chevron `▾` but gains the same pill chrome + an `aria-expanded` state.

**Risk** — Low. Affects `src/pages/TransactionsPage.tsx` only (the `.filter` and `.filters` rules are local to that surface in `src/styles/index.css`).

---

## 3. Transactions table (`.transaction-table` + `.transaction-row` + `.transaction-table-head`)

**Current** — 5-column grid (`minmax(260px,1.35fr) 1fr .55fr .8fr 15px`). Rows are full-width buttons; hover changes background only.

#### Planned

- **Copper left edge on hover**: 2px pseudo-rail running `6px` from top to bottom of the row, copper color, `opacity:0 → 1` on hover with 180ms transition.
- **Active row state** (`.transaction-row.is-active`) — matches the `?tx=` deep link. Paints the copper rail + a copper-tinted background:
  ```css
  background: color-mix(in srgb, var(--copper) 12%, transparent);
  ```
  Driven by the existing `selectedId === tx.id` check in `TransactionsPage`. Requires adding the `is-active` class to the matching row in the JSX.
- Row padding bumps `12px 16px` → `14px 20px 14px 24px` (left indent for the rail).
- The head gets a soft `panel-2` tint via `background:color-mix(in srgb, var(--panel-2) 60%, transparent)` so it reads as a header row.
- The operation icon tile (`.transaction-kind > i`) gets depth:
  ```css
  border-radius: 6px;
  background: color-mix(in srgb, var(--copper) 8%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--copper) 30%, transparent);
  ```
- The hash + age cells become **tabular monospace** (`font-variant-numeric:tabular-nums`) so columns line up across rows.
- The whole table block gets `border-radius:0 0 var(--radius-lg) var(--radius-lg)` + `overflow:hidden` (top corners stay sharp because the parent `.panel-head` is the actual top edge).

**Risk** — Low. The only JS change is adding `is-active` to the row whose `id === selectedId`.

---

## 4. AdvancedFiltersPopover (`.filters-popover` + `.filters-backdrop`)

**Current** — portaled to `document.body` via `createPortal`. Backdrop is `position:fixed; inset:0; background:transparent` (a click target only). Popover uses **inline `top` / `bottom` / `right` set together** in `style={{ top, bottom, right }}` (the inline setter is currently a hand-positioned fallback when the trigger's bounding rect would push the popover off-screen).

#### Planned

- **Use the `inset` shorthand** for positioning. Replace the hand-rolled inline `top:220px; right:80px` style with `inset: 220px auto auto 80px` (top, right, bottom, left in one declaration). The same flip-up logic in JS stays — only the CSS shape changes.
- **Visible backdrop**: dim + blur so the popover reads as a real modal layer:
  ```css
  body[data-mode="after"] .filters-backdrop {
    background: rgba(7,9,10,.45);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }
  ```
- Popover entrance animation:
  ```css
  .filters-popover { animation: popover-in .18s var(--ease); }
  @keyframes popover-in {
    from { opacity: 0; transform: translateY(-6px) scale(.98); }
    to   { opacity: 1; transform: none; }
  }
  ```
- Popover rows become pills (inherits from §2): `padding:10px 12px; border:1px solid transparent; border-radius:var(--radius-md)`. Active row uses the same copper filled background.
- Popover container gets `padding:6px; border-radius:var(--radius-lg); box-shadow:var(--shadow-modal)` (the larger shadow).

**Risk** — Low. The JS already uses `useModalDismiss(onClose)` for the Escape + focus-restore path. The inline-style swap is one-line.

---

## 5. ReceiptDrawer (`.receipt-drawer` + `.drawer-list` + `.receipt-proof-disclosure`)

**Current** — `position:absolute; inset:0 0 0 auto; width:min(470px,100%); padding:78px 32px 32px; border-left:1px solid var(--copper); background:var(--panel); box-shadow:var(--shadow-drawer)`. The 78px padding clears the sticky topbar. Proof rows align left.

#### Planned

- **Soft copper hairline** replacing the hard border:
  ```css
  border-left: 1px solid var(--line);
  background: linear-gradient(180deg, var(--panel-2), var(--panel));
  position: relative;
  ```
  ```css
  .receipt-drawer::before {
    content: ""; position: absolute;
    top: 78px; bottom: 32px; left: -1px; width: 2px;
    background: linear-gradient(180deg, var(--copper), transparent);
  }
  ```
- **Right-aligned monospace amounts** in `.drawer-list dd` so values line up against the right edge of the drawer:
  ```css
  justify-content: flex-end;
  text-align: right;
  ```
- `.drawer-list .row` padding bumps `12px 0` → `14px 0` for a calmer vertical rhythm.
- The close button gains the new rounded chrome:
  ```css
  border-radius: var(--radius-md);
  border-color: var(--line);
  ```
- The primary CTA (`.button-primary`) gains the rounded radius + inset highlight + soft copper glow (inherits from the global button-after treatment).
- Drawer entrance animation:
  ```css
  .receipt-drawer { animation: drawer-in .22s var(--ease); }
  @keyframes drawer-in {
    from { transform: translateX(20px); opacity: 0; }
    to   { transform: none; opacity: 1; }
  }
  ```
  Backdrop animation is matched. Both suppressed via `prefers-reduced-motion`.
- `.receipt-proof-disclosure` (the `<details>` inside the drawer) gets a soft border at `>700px` so it reads as its own panel.

**Risk** — Low. The drawer is keyed off the existing `selected` state and `onClose` handler — no markup change to React.

---

## 6. Filter result count + chip row (`.transaction-filter-controls` + `.result-count`)

**Current** — `display:grid; justify-items:end` with the count line above the filter chips. Reads as a footer to the panel head.

#### Planned

- Stack the count above the chips but in a single row container with `align-items:end; justify-items:end`.
- The count `font: 500 var(--fs-mono)/1 "JetBrains Mono", monospace` becomes `color:var(--copper-bright)` for a deliberate accent — "12 of 14 receipts" reads at a glance.
- The `filters` flex row gets `gap:6px` (was `4px`) for clearer separation between chips.
- On `<700px`, the filter row scrolls horizontally with `scroll-snap-type:x proximity` and `overscroll-behavior-inline:contain` — already in production but verify after the pill change.

**Risk** — Low.

---

## 7. Empty state (`.transaction-empty-state`)

**Current** — `display:grid; justify-items:start; gap:8px; padding:var(--space-5) var(--space-5)` with a `<p>` and a `text-link` CTA. Plain text.

#### Planned

- Add a **dashed border + radius + tinted background** to match the Dashboard empty state pattern (§6 of dashboard-after.md):
  ```css
  padding: 36px;
  border: 1px dashed var(--line);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--panel-2) 40%, transparent);
  ```
- The CTA `text-link` keeps its copper-bright color but gains a copper underline on hover.

**Risk** — Low.

---

## 8. Loading skeleton (`.transaction-table-skeleton`)

**Current** — renders 3 skeleton rows with empty `<strong>` / `<small>` placeholders during the first history poll only. Plain rows that look almost identical to the loaded table.

#### Planned

- Add a **subtle pulse** so the user reads it as "loading" rather than "empty":
  ```css
  .transaction-table-skeleton .transaction-row {
    opacity: 0.55;
    animation: skeleton-pulse 1.4s var(--ease) infinite;
  }
  @keyframes skeleton-pulse {
    0%, 100% { opacity: 0.55; }
    50%      { opacity: 0.85; }
  }
  ```
  Animation suppressed via `prefers-reduced-motion`.
- The skeleton rows get a soft shimmer — a `linear-gradient` stripe sliding right-to-left via a background-position keyframe. Optional; can be deferred if the pulse alone is enough.

**Risk** — Low. Cosmetic; the skeleton is only shown during the initial history poll (background re-polls do not resurrect it).

---

## 9. PageHead refresh button

**Current** — `.button.button-secondary` with icon + label. Reads as a generic secondary CTA.

#### Planned

- Inherits the global button-after treatment (rounded radius, inset highlight). The refresh icon picks up a subtle rotate animation when the toast fires (optional; can be deferred).
- The `aria-live` region for the toast (`.notice-toast`) keeps its existing chrome; no change.

**Risk** — Low.

---

## 10. Deep-link state pill highlighting

**Current** — the `?tx=` deep link selects a row and opens the drawer. Once closed, no visual cue remains about which row was selected.

#### Planned

- Combine with the `.transaction-row.is-active` rule from §3 — when the drawer is opened via the deep link, the row stays highlighted while the drawer is open.
- When the drawer closes, `selectedId` becomes `null` and the active class is removed.

**Risk** — Low. Pure CSS-driven; the JS already clears `selectedId` in `onClose`.

---

## Token discipline summary

Every change above reuses tokens already declared in `src/styles/index.css` lines 1–114 (`--completion-*` ladder, `--copper*`, `--phosphor`, `--warning`, `--line`, `--line-soft`, `--panel`, `--panel-2`, `--ink`, `--text`, `--muted`, `--dim`, `--radius-md`, `--radius-lg`, `--shadow-modal-sm`, `--shadow-modal`, `--shadow-drawer`, `--shadow-stat`, `--ease`). No new tokens are introduced.

## Implementation order (least → most risk)

1. `.transaction-empty-state` (cosmetic, no JS)
2. `.transaction-table-head` (cosmetic tint, no JS)
3. `.ops-summary` rounded card stack (cosmetic, no JS)
4. `.transaction-row.is-active` class wiring (one JSX attribute)
5. `.filters` + `.filter` pills (cosmetic, no JS — chip width may grow ~10px and need a layout check)
6. `.transaction-row` copper rail + tabular amounts (cosmetic, hover only)
7. `.filters-popover` pill rows + entrance animation + blurred backdrop (CSS + one inline-style change)
8. `.receipt-drawer` copper hairline + entrance animation + right-aligned amounts (cosmetic)
9. `.transaction-table-skeleton` pulse animation (cosmetic, reduced-motion safe)
10. Deep-link active-row highlight (combines with §4)

## What is explicitly NOT changed

- Hook internals (`useEventHistory`, `useEventStream`, `useAgents`).
- The dedupe logic (`eventDedupeKey`, `isOwnEvent`).
- The `?filter=` and `?tx=` deep-link parsing in `useEffect` — only the visual treatment of the selected row changes.
- The transaction table column ratios (`minmax(260px,1.35fr) 1fr .55fr .8fr 15px`) — proven ratio, leave alone.
- The status pill colors (`.state-pill.state-confirmed`, `.state-reverted`, etc.) — only the wrapper shape changes (badge).
- Anything in `ChatPage`, `FlowPage`, `AgentPage`.
