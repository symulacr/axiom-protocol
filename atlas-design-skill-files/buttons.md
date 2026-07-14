# Buttons — TypeUI · Enhanced

> **TypeUI · Enhanced** — the action layer of the system.
> Depends on: `colors.md`, `radius.md`, `shadows.md`, `spacing.md`, `typography.md`, `badges.md`

In Enhanced, a button is a crisp **square** (`radius-xxl`, 0px) control with a solid fill, **no shadow**, and a brand focus ring — classic and rectangular, like the buttons on the reference site. Buttons are confident but never loud: exactly one filled **brand** primary leads each section, and everything else steps back to secondary, tertiary, ghost, outline, or link. The saturated **indigo brand** carries "the next step" and always pairs with a **`white` label** (never dark text on the indigo fill); the status fills (success, danger, warning) appear only when the action genuinely is that.

---

## Anatomy

| Part | Role |
|---|---|
| **Root** | Button or link-styled control |
| **Label** | Text content |
| **Leading / trailing icon** | Optional 16px glyph |
| **Badge** | Optional count pill inside label (see `badges.md`) |
| **Loader** | Optional spinner replacing icon or prefixing label |

---

## Sizes

**Dashboard rule — small buttons by default.** In dashboard, application, and product-UI layouts, buttons use the **Small** size — never the **Base** (or larger) default. Reserve Base and larger for marketing, landing, and editorial pages.

Five tiers, all sharing the same soft shell. `font-size-sm` base keeps buttons compact and businesslike; reach for Large/Extra large only on marketing CTAs.

| Size | Font | Padding (inline × block) | Icon |
|---|---|---|---|
| Extra small | font-size-xs | `spacing-3` × `spacing-1-5` | 14px |
| Small | font-size-sm | `spacing-3` × `spacing-2` | 16px |
| Base (default) | font-size-sm | `spacing-4` × `spacing-2-5` | 16px |
| Large | font-size-md | `spacing-5` × `spacing-3` | 16px |
| Extra large | font-size-md | `spacing-6` × `spacing-3-5` | 20px |

Shared shell, every size:

| Property | Value |
|---|---|
| Weight | font-weight-medium |
| Line height | line-height-component |
| Radius | `radius-xxl` (0px, square) — every size and variant |
| Shadow | None (`elevation-none`) on every variant |
| Gap label ↔ icon | `spacing-1-5` |
| Min touch target | 44px on mobile — pad to meet if label is short |

---

## Variants — filled

The workhorses. Filled buttons are flat (no shadow) with a 4px intent focus ring; hover deepens the fill one step.

| Variant | Background | Text | Border | Hover background | Focus ring |
|---|---|---|---|---|---|
| **Primary (brand)** | `brand` | `white` | transparent | `brand-strong` | `brand-medium` |
| **Secondary** | `neutral-secondary-medium` | `body` | `default-medium` | `neutral-tertiary-medium` + `heading` text | `neutral-tertiary` |
| **Tertiary** | `neutral-primary-soft` | `body` | `default` | `neutral-secondary-medium` + `heading` text | `neutral-tertiary-soft` |
| **Success** | `success` | `white` | transparent | `success-strong` | `success-medium` |
| **Danger** | `danger` | `white` | transparent | `danger-strong` | `danger-medium` |
| **Warning** | `warning` | `white` | transparent | `warning-strong` | `warning-medium` |
| **Dark** | `dark` | `white` | transparent | `dark-strong` | `neutral-tertiary` |
| **Ghost** | transparent | `heading` | transparent | `neutral-secondary-medium` | `neutral-tertiary` |

Focus ring: a visible spread using the intent ring token; offset 0. This ring is how the system stays keyboard-first, so it is never removed.

---

## Variants — outline

The quieter sibling of filled: transparent or `neutral-primary` fill, a **2px** intent border, and an intent-foreground label. On hover the button "fills in" with its intent and the label flips to `white` (or, on light warning fills, a dark label for contrast).

**Outline border width is always 2px** — every outline variant carries a 2px border in its intent color (the `Border` column below names the color, the width is 2px). This is what gives the outline button its weight against the square, classic fill buttons.

| Variant | Border (2px) | Label | Hover fill |
|---|---|---|---|
| Brand | `brand` | `fg-brand` | `brand` (label → `white`) |
| Neutral | `default` | `body` | `neutral-secondary-soft` |
| Success | `success` | `success` | `success` |
| Danger | `danger` | `danger` | `danger` |
| Warning | `warning` | `warning` | `warning` |

Outline sizes mirror the filled size table exactly.

---

## Signature interaction — classic solid fill

The defining button of Enhanced is a **classic, solid, square control** — exactly like the buttons on the reference site. The primary rests on a solid `brand` (`#1313BA`) fill with a `white` label and **square (0px) corners**; on hover the fill deepens one step to `brand-strong`; on press it settles darker still. No sweep, no wedge, no animated frame — just a confident rectangle that darkens on interaction. The rule is **stack-agnostic**: it describes which tokens supply each value, so it can be built with plain CSS, a CSS-in-JS layer, a utility framework, or any renderer.

**Token sourcing (never hard-coded):**

| Aspect | Source |
|---|---|
| Resting background | `brand` — `colors.md` |
| Resting label | `white` (the indigo fill demands a light label) |
| Hover background | `brand-strong` — `colors.md` |
| Active background | `brand-strong` (slightly darkened / pressed) — `colors.md` |
| Focus ring | `brand-medium` — `colors.md` |
| Corner radius | `radius-xxl` (0px, square) — `radius.md` |
| Padding / sizing | the **Sizes** table above (`spacing-*`) — `spacing.md` |
| Font family / weight / size | `font-family`, `font-weight-medium`, size per tier — `typography.md` |
| Hover duration | ~150ms (see **Motion**) |

**Behavior:** at rest, a solid `brand` fill with a `white` label. On hover, the fill deepens to `brand-strong`. On focus, the `brand-medium` ring appears. On active press the fill darkens further. Honor `prefers-reduced-motion` by keeping the color change instant.

**Reference implementation** (illustrative only — colors shown literally here must resolve to the tokens in the table above; sizes, radius, and font come from the foundation files):

```css
/* Classic solid button — map every literal to a token before shipping */
button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.625rem 1rem;          /* → spacing-* per size tier */
  font-size: 0.875rem;             /* → font-size-* per size tier */
  font-family: inherit;            /* → font-family (Inter) */
  font-weight: 500;                /* → font-weight-medium */
  line-height: 1.3;                /* → line-height-component */
  color: var(--white);             /* label on the indigo fill */
  background: var(--brand);        /* #1313BA */
  border: none;
  border-radius: var(--radius-xxl); /* 0px — square */
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s ease;
}

button:hover  { background: var(--brand-strong); }
button:active { background: var(--brand-strong); }

button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--brand-medium); /* the focus ring */
}
```

---

## Icon buttons

A square control — width equals height per tier — for toolbars and compact actions. Use any filled, outline, or ghost row above.

| Size | Box | Icon |
|---|---|---|
| Small | 36 × 36px | 16px |
| Base | 40 × 40px | 16px |
| Large | 44 × 44px | 20px |

There is no visible label, so an **`aria-label` is mandatory** — never ship a nameless icon button.

---

## Special patterns

### With badge

Primary label + a circular count pill (`spacing-2` gap) — see the button-attached count in `badges.md`.

### Loader

A 16px spinner sits at the label start; keep or hide the label, but mark the control `disabled` or `aria-busy="true"` while it runs so it cannot be double-submitted.

### Disabled

Drop to 50% opacity or `fg-disabled` text, remove hover and the focus ring, set `pointer-events: none`, and apply the native `disabled` attribute. A disabled button must never look clickable.

### Link as button

An anchor wearing button tokens — use it for navigation that should read as a primary action, and keep the keyboard focus ring intact.

### Provider / OAuth / payment

The one place third-party brand color is allowed: isolated provider variants (social login, wallet, card network). Document the provider hex *outside* the semantic tokens and never recycle it as a system intent.

### Gradient / colored shadow (optional marketing)

Not part of core Enhanced. Default product UI is solid fills only. If a campaign needs a gradient, define the paired tokens in `colors.md` and `shadows.md` first — do not hand-roll them on the button.

---

## Motion

Enhanced buttons respond instantly and quietly — no bounce, no theatrics.

| Transition | Duration | Properties |
|---|---|---|
| Hover / focus | 150ms | Background, text, border |
| Active press | 100ms | Slight scale or darken (optional) |
| Loader | continuous | Spinner rotation |

---

## Accessibility

- Native `<button type="button|submit|reset">` for actions; `<a>` only when navigating.
- Icon-only controls carry a descriptive `aria-label`.
- Loading state uses `aria-busy="true"` and blocks duplicate submits.
- The 4px focus ring is always visible on keyboard focus — never remove the outline without an equivalent replacement.
- Truly inactive controls leave the tab order.

---

## Prohibited

- **No raw hex in core variants** — semantic tokens only (documented provider buttons are the sole exception).
- **No corners other than `radius-xxl`** (0px, square) — rounded or pill button corners are a different theme, not Enhanced.
- **No framework class names** in specs.
- **No shadows on buttons** — they are flat (`elevation-none`); they sit on the page, they do not float.
- **No two primary brand buttons** side by side in one action group — Enhanced allows a single obvious next step.
- **No font-size above `font-size-md`** on standard buttons.
- **No ghost variant for a destructive confirm** — use danger filled or outline so the stakes read.
- **No gradient fills** in default product UI without new tokens.
