# Elevation & Shadow Tokens — TypeUI · Enhanced

> The depth system for **TypeUI · Enhanced**. Enhanced is **flat** — depth is communicated through a **hairline `default` (`#E8E8F8`) border**, not shadow. Cards and panels carry the same background color as their section and separate from it by that border alone; floating overlays read through a backdrop scrim and that same border. No card and no component carries a drop shadow. The elevation tokens below are retained as the system’s depth vocabulary, but every level resolves to **`none`** in this theme; they are the single source of truth — components reference them, never one-off shadow values. **One documented exception:** floating overlays — dropdowns, popovers, and menus — lift off the page and therefore carry a real **medium drop shadow** (`elevation-2`) over their bordered panel; resting cards and sections stay flat (see `dropdowns.md`).

Depends on: `colors.md` (separation comes from the border token and surface color, not shadow color).

---

## Token naming

| Pattern | Role |
|---|---|
| `elevation-none` | Flat — no shadow |
| `elevation-{1–5}` | Depth level by intent; all resolve to `none` **except `elevation-2`, the floating-overlay medium shadow** — resting separation is handled by surface color and border |

Each level is a single token — do not split or hand-roll shadow layers in component code.

---

## Shadow anatomy

| Property | Meaning |
|---|---|
| Offset X | Horizontal displacement (+ right, − left) |
| Offset Y | Vertical displacement (+ down, − up) |
| Blur | Softness of the shadow edge |
| Spread | Expansion (+) or contraction (−) of the shadow shape |
| Color | RGBA — opacity controls perceived elevation |

Enhanced does not paint shadows; this anatomy is retained only so a documented exception (if ever added) describes its layers consistently.

---

## Elevation scale

| Token | Shadow value |
|---|---|
| elevation-none | `none` |
| elevation-1 | `none` |
| elevation-2 | `0px 4px 16px rgba(16, 24, 40, 0.10)` |
| elevation-3 | `none` |
| elevation-4 | `none` |
| elevation-5 | `none` |

---

## Flat registry

```
elevation-none   none
elevation-1      none
elevation-2      0px 4px 16px rgba(16, 24, 40, 0.10)
elevation-3      none
elevation-4      none
elevation-5      none
```

---

## Usage by surface type

| Surface | Token | Rationale |
|---|---|---|
| Resting cards, accordions (grouped) | `elevation-none` | Separation comes from the lighter card surface, not shadow |
| Separated cards, hover lift | `elevation-none` | Boundary read from surface tone and spacing |
| Dropdowns, popovers, menus | `elevation-2` | A real **medium** drop shadow — the floating-overlay exception; lifts the bordered panel off the section |
| Modals, drawers (sheet) | `elevation-none` | Separation from a backdrop scrim, not a drop shadow |
| Floating action, critical overlay | `elevation-none` | Emphasis through surface and placement |
| Flat lists, flush accordions, inline fields | `elevation-none` | No depth signal |

---

## Principles

- **Hierarchy** — closeness to the viewer is signalled by the `default` border, spacing, and scrims — never by a drop shadow.
- **Emphasis** — to prioritize a surface, give it a stronger border (e.g. `brand`) or add a scrim behind it; do not lift its fill and do not reach for shadow.
- **Restraint** — the whole system is flat; if a screen looks like it needs a shadow to separate two surfaces, use the `default` border instead.

---

## Prohibited

- **No raw box-shadow strings in components** — use an `elevation-*` token (all resolve to `none`).
- **No drop shadows on cards or components** — Enhanced is flat; separation is by surface color and scrims.
- **No colored shadows** unless a dedicated token is added to this file with documented intent.
- **No reintroducing shadow depth** to “lift” a floating element — use a lighter panel surface and a backdrop scrim.
- **No drop shadow to fake depth** — cards and shells separate with the `default` (`#E8E8F8`) border and surface color, not with elevation.
- **No foreign elevation naming** — map into these tokens in your implementation layer; do not rename and call that the design system.
</content>
