# Dashboard · AFTER planned work

Source surfaces: `src/pages/DashboardPage.tsx`, `src/components/axiom/FirstRunChecklist.tsx`, `src/components/axiom/GasTankCard.tsx`, `src/components/MobileDisclosure.tsx`, `src/components/ui.tsx` (`EmptyState` / `Spinner`), `src/components/axiom/Controls.tsx` (`Button` / `PanelHead` / `Status`).

Mirror of the BEFORE markup in `apps/frontend/.design-audit/dashboard-transactions-before-after.html`. All changes below are CSS-only and token-faithful — they consume the existing `--completion-*` ladder, never invent new tokens.

---

## 1. Stats grid (`.stats-grid` + `.stat`)

**Current** — a 1px-gap-bordered table that reads as a utilitarian data grid. `gap:1px` between cells; `background:var(--line)` shines through the gap; `padding:16px` only.

#### Planned

- Convert to a **rounded card stack** with `gap:14px`, `border:0`, transparent background. Each `.stat` becomes its own surface.
- `.stat` gets `border:1px solid var(--line)`, `border-radius:var(--radius-lg)`, soft top-down gradient via `linear-gradient(180deg, var(--panel-2), var(--panel))`.
- Add a **copper index rail** (`:after` pseudo-element) running 2px wide on the left, 14px from top, opacity 0.6.
- Refined type hierarchy:
  - `.stat-top` becomes `font:var(--fs-mono)` tracked uppercase with `.12em` letter-spacing (currently `.08em`) in `--dim` (currently `--muted`).
  - `.stat strong` becomes 26px Syne 700, `font-variant-numeric:tabular-nums` (currently 18px), color `--ink` (not inherited).
  - `.stat small` carries a copper accent when it signals attention — a `.alert` modifier that sets `color:var(--copper-bright)`.
- `.stat-icon` becomes a 24px disc with `background:color-mix(in srgb, var(--copper) 16%, transparent)` and copper-bright text.
- Hover lift: `transform:translateY(-2px)`, copper-tinted border, soft drop shadow.

**Risk** — Low. Pure CSS, no markup changes. `.stat` instances continue to render label / value / change slots.

---

## 2. GasTankCard (`.gas-tank-card`)

**Current** — 7 inline `style={{ color: COLORS.textDim }}` rules (loading state, deposit placeholder, faucet balance, faucet ineligible badge). One inline `style={{ width: \`${grantsPct}%\` }}` for the progress fill. The component reaches into `COLORS` directly, breaking the `--completion-dim` token contract.

#### Planned

- **Replace every inline color rule with two semantic classes**:
  - `.gas-tank-card__note` → `color:var(--dim); font:var(--fs-mono) "JetBrains Mono", monospace`
  - `.gas-tank-card__error` → `color:var(--warning); font:var(--fs-mono) "JetBrains Mono", monospace`
- The grants progress bar moves from raw `var(--copper)` to a **copper gradient** with a soft glow:
  ```css
  background: linear-gradient(90deg, var(--copper), var(--copper-bright));
  box-shadow: 0 0 12px color-mix(in srgb, var(--copper) 50%, transparent);
  ```
- Track becomes `border:0; border-radius:999px; background:color-mix(in srgb, var(--panel-2) 50%, transparent)`.
- The h3 becomes a tracked uppercase label (12px mono) with a leading copper dot (`::before` 6px circle).
- The balance row becomes a 2-column grid (`1fr auto`) with the value at 28px Syne 700 tabular and the suffix right-aligned.
- The card itself gains `border-radius:var(--radius-lg)` and the soft top-down gradient.
- **Component code change**: swap the inline styles for the class names above. No new tokens. No new state.

**Risk** — Low. Affects `src/components/axiom/GasTankCard.tsx` only. All other GasTank consumers (none in this surface) would auto-inherit.

---

## 3. Agent register (`.agent-row`, `.activity-row`)

**Current** — flat rows that only change background on hover. The hover state is `rgba(210,139,82,.07)` — a subtle tint but no other affordance.

#### Planned

- **Copper left rail on hover** — `::before` pseudo-element, `2px` wide, full height with `8px` top/bottom inset, copper color, `opacity:0` → `1` on hover with a 180ms transition. Matches the design pattern of "hover reveals the index rail" used elsewhere in the product.
- The `.agent-row-mark` (the bot icon tile) gains depth via `box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--copper) 30%, transparent)` plus a tinted `background: color-mix(in srgb, var(--copper) 8%, var(--panel-2))`.
- `.agent-value b` (the ETH balance) becomes `font-variant-numeric:tabular-nums; color:var(--ink)` — values line up vertically across rows.
- Padding bumps from `12px 16px` → `14px 20px 14px 24px` (left indent for the rail).
- Row heights: `.agent-row`, `.activity-row` get `min-height: var(--hit-area)` so they remain touch-friendly on dense density modes.

**Risk** — Low. CSS-only, no markup change. Tab order, focus rings, and selection state all preserved.

---

## 4. FirstRunChecklist (`.checklist-card`)

**Current** — 3-step `<ol>` of `.checklist-step` rows. The `.checklist-mark` is a 34×34 square with a copper border; done state fills with copper-bright text. The dismiss is a 28×28 ghost icon. The done state collapses to a single phosphor-tinted line.

#### Planned

- **Round the step marks** (`border-radius:50%`) and add a smooth color transition on the done state.
- The done state moves from copper-bright text to a phosphor-tinted fill:
  ```css
  background: color-mix(in srgb, var(--phosphor) 18%, transparent);
  border-color: var(--phosphor);
  color: var(--phosphor);
  ```
- The card itself gains a copper edge gradient on the left (`::before` pseudo-element, full height, copper-bright → transparent).
- Step hover gets a left-to-right copper gradient background (more directional than the current uniform tint).
- Step padding: `12px 16px` → `14px 20px 14px 22px` (small indent).
- The collapsed "Fleet active" line keeps the phosphor accent but adds a subtle copper left border for hierarchy.
- The dismiss icon hover gains a soft background tint (matching `.icon-button:hover`).

**Risk** — Low. Component code: keep the same `aria-disabled` / `done` flag wiring; just add `border-radius:50%` and color tokens.

---

## 5. ContextStrip (`.context-strip`)

**Current** — a 3-column (later 2 / 1) bordered table with one copper-edged `.context-action` cell. Dividers are `1px solid var(--line)` vertical bars between cells.

#### Planned

- Drop the cell borders in favor of a **soft band with a copper top hairline**:
  ```css
  border-color: transparent;
  background: linear-gradient(180deg, var(--panel-2), var(--panel));
  box-shadow: var(--shadow-stat);
  position: relative;
  ```
  ```css
  .context-strip::before {
    content: ""; position: absolute;
    inset: 0 0 auto 0; height: 1px;
    background: linear-gradient(90deg, transparent, var(--copper) 32%, var(--copper) 68%, transparent);
  }
  ```
- `.context-cell` padding bumps `16px` → `16px 20px`.
- The `.context-action` "review queue" cell gains a **pulsing attention dot**:
  ```css
  .context-action strong::after {
    content: ""; width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--copper-bright);
    box-shadow: 0 0 8px var(--copper-bright);
    animation: dot-pulse 2.6s var(--ease) infinite;
  }
  @keyframes dot-pulse { 0%,100% { opacity:.55 } 50% { opacity:1 } }
  ```
  Animation suppressed via `@media (prefers-reduced-motion: reduce)`.

**Risk** — Low. Token-faithful. Animation honors reduced-motion.

---

## 6. Empty state (`.empty-state`)

**Current** — `padding:24px; color:var(--dim); font-size:var(--fs-small)` plain text block. The CTA button lives below the hint without composition.

#### Planned

- Compose with a **dashed border + radius + soft tinted background**:
  ```css
  padding: 28px 24px;
  border: 1px dashed var(--line);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--panel-2) 40%, transparent);
  ```
- The title `<strong>` becomes `font-size:var(--fs-body); font-weight:var(--fw-label); color:var(--ink); margin-bottom:4px`.
- The hint `<span>` gets `display:block; margin-bottom:12px` so it sits on its own line.
- The CTA `.button` gets `margin-top:8px` to clear the hint.
- The transaction-empty-state variant gets `padding:36px` (a touch more breathing room).

**Risk** — Low. CSS-only. Affects `.empty-state` everywhere; the audit visual confirms no regression on other surfaces.

---

## 7. MobileDisclosure initial state

**Current** — `useState(() => !window.matchMedia("(max-width: 480px)").matches)`. Always open at desktop regardless of data.

#### Planned

- Switch the initial-state factory to **open when there is data, closed when there isn't**:
  ```ts
  const [open, setOpen] = useState(() => {
    if (window.matchMedia("(max-width: 480px)").matches) return false;
    // data.length is the telemetry count — passed in by the parent
    return (initialDataCount ?? 0) > 0;
  });
  ```
- This requires `MobileDisclosure` to accept an optional `defaultOpen` prop (or have its `open` state lifted). Lift is preferred — matches the controlled-component pattern used elsewhere.
- Add a leading copper index hairline (full width, 1px, copper gradient) when the disclosure is open:
  ```css
  body[data-mode="after"] .dashboard-mobile-disclosure::before {
    content: ""; position: absolute;
    top: -1px; left: 20%; right: 20%; height: 1px;
    background: linear-gradient(90deg, transparent, var(--copper), transparent);
  }
  ```

**Risk** — Low. The change is opt-in (only Dashboard passes the data count); other consumers of `MobileDisclosure` keep viewport-driven default until they adopt the same pattern.

---

## 8. Activity panel (`.activity-panel` + `.activity-row`)

**Current** — the panel sits inside the `MobileDisclosure` telemetry band. Activity rows are 3-max, mixing local receipts and chain events.

#### Planned

- Inherits the row refinements from §3 (copper left rail on hover).
- Activity list gets a subtle **section divider** at the top of the panel for hierarchy with the agent panel below.
- The chevron `›` becomes copper on hover for click affordance.

**Risk** — Low.

---

## 9. Page head + action lane (`.page-head`, `.action-lane`)

**Current** — `page-head-asymmetric` grid; action lane has `border-left:2px solid var(--copper)` + gradient background.

#### Planned

- The action lane's review-count headline becomes 26px Syne 700 tabular.
- The scope line (`3 unconfigured · 2 failing`) gets monospace tracking and copper-bright tint when failing > 0.
- The refresh `text-link` gets a subtle copper underline on hover (not just color change).
- The asymmetric grid breakpoint at `900px` keeps its current collapse behavior.

**Risk** — Low.

---

## 10. Status pill (`.status`)

**Current** — unstyled text span with `color:var(--phosphor)` or `var(--warning)` or `var(--dim)`. No background, no border.

#### Planned

- Wrap in a **rounded badge** with `currentColor` border (so tone drives the chip color):
  ```css
  padding: 2px 8px;
  border: 1px solid currentColor;
  border-radius: 999px;
  font-size: 11px;
  letter-spacing: 0.06em;
  ```
- Same treatment for `.state-pill` so the tone reads at a glance.

**Risk** — Low. Affects `Status` component in `src/components/axiom/Controls.tsx` and the shared `.state-pill` rule.

---

## Token discipline summary

Every change above reuses tokens already declared in `src/styles/index.css` lines 1–114 (`--completion-*` ladder, `--copper*`, `--phosphor`, `--warning`, `--line`, `--line-soft`, `--panel`, `--panel-2`, `--ink`, `--text`, `--muted`, `--dim`, `--radius-md`, `--radius-lg`, `--shadow-modal-sm`, `--shadow-modal`, `--shadow-drawer`, `--shadow-stat`, `--ease`). No new tokens are introduced.

## Implementation order (least → most risk)

1. `.empty-state` (no data, no JS)
2. `.status` / `.state-pill` badges (cosmetic, no JS)
3. `.stats-grid` + `.stat` (cosmetic, no JS)
4. `.context-strip` (cosmetic, single keyframe added)
5. `.agent-row` / `.activity-row` (cosmetic, hover only)
6. `.checklist-card` + `.checklist-mark` (cosmetic, no JS)
7. `.gas-tank-card` (component code change — class swap only)
8. `.activity-panel` (inherits from §5)
9. `.page-head` / `.action-lane` (cosmetic)
10. `MobileDisclosure` initial state (lifted state — touches the component)

## What is explicitly NOT changed

- Hook internals (`usePortfolio`, `useAgents`, `useVaultDataBatch`, `useHealth`, `useEventHistory`).
- The attention split logic (`unconfigured` vs `failing`).
- The `?filter=review` deep link on the action lane.
- The 4 refetches + double-toast bug in the `refresh` handler (out of audit scope).
- The empty-state copy.
- Anything in `ChatPage`, `FlowPage`, `AgentPage`.
