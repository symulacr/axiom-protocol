# Border Radius Tokens — TypeUI · Enhanced

> Corner-radius tokens for the **TypeUI “Enhanced”** design system. Enhanced is a tight, precise, technical theme: its single most recognizable trait is a **crisp 0px (square) corner on every component shell**, paired with **fully round controls** where the shape is functional (toggle track, avatars, radio, range). Every value below is a literal size — tokens are the source of truth; components reference tokens, never ad-hoc px or rem.

Depends on: none (pairs with `colors.md` for nested-radius math on filled surfaces).

**Root assumption:** `1rem = 16px` unless the product documents a different root.

---

## Enhanced radius convention (read first)

This is the rule that defines the Enhanced look. Do not deviate without a documented exception.

| Rule | Token | Value | Applies to |
|---|---|---|---|
| **Component shell = 0px (square)** | `radius-xxl` | 0 | Every component’s outer container or control shell — buttons, inputs, selects, textareas, file/search/number/phone fields, cards, modals, dropdown & menu panels, alerts, accordions, tabs panels, pagination groups, tables, tooltips, popovers, badges, chips, tags |
| **Functionally round controls** | `radius-full` | 999px | The toggle track, avatars, radio control, range thumb & track, status dots, spinners — controls whose meaning depends on a round shape |
| **Checkbox box** | `radius-none` | 0 | The 16px tick box — square like every other shell |
| **Nested child inside a shell** | `radius-none` | 0 | Menu items, inset cells, small controls sitting inside a padded parent (see Nested radius) |
| **Flush data** | `radius-none` | 0 | Table cells, flush list rows, dividers |

A component’s **default** corner is always 0px (square) unless it appears in the functionally-round row above.

**Edge-anchored exception:** panels that sit flush against a viewport edge — drawers, full-bleed bottom sheets — keep **square** corners on the flush edges. With a 0px system this is automatic; nothing rounds.

---

## Token naming

| Pattern | Role |
|---|---|
| `radius-base` | Single base unit all steps derive from |
| `radius-{step}` | Named step on the scale (`none` → `full`) |

Steps are **multipliers of `radius-base`**, not independent picks.

---

## Base unit

| Token | rem | px |
|---|---|---|
| radius-base | 0 | 0 |

---

## Radius scale

| Token | Multiplier | rem | px | Typical use |
|---|---|---|---|---|
| radius-none | 0 | 0 | 0 | Square corners, table cells, flush dividers |
| radius-xs | 0× | 0 | 0 | Hairline inset frames, checkbox tick box |
| radius-sm | 0× | 0 | 0 | Nested children inside a shell (menu items, inset cells) |
| radius-md | 0× | 0 | 0 | Dense inner controls |
| radius-lg | 0× | 0 | 0 | Secondary shell surfaces |
| radius-xl | 0× | 0 | 0 | Larger shell surfaces |
| radius-xxl | 0× | 0 | 0 | **Enhanced component shell default** — buttons, inputs, cards, modals, menus, alerts, tabs, tables, tooltips, badges |
| radius-xxxl | 0× | 0 | 0 | Oversized hero cards / large feature panels — square like the rest |
| radius-full | 9999× | — | 9999px | Toggle track, avatars, radio, range, status dots, spinners — functionally round ends |

The whole box scale converges on 0px because Enhanced is a uniformly square-cornered theme — every standard shell is a crisp rectangle, and only functionally-round controls take `radius-full`.

---

## Flat registry

```
radius-base    0
radius-none    0
radius-xs      0
radius-sm      0
radius-md      0
radius-lg      0
radius-xl      0
radius-xxl     0
radius-xxxl    0
radius-full    9999px
```

---

## Nested radius

When a parent wraps a child with padding between them:

```
innerRadius = outerRadius − padding
```

In a 0px system every shell is square, so nested children are square too — the inner corner stays concentric at 0px. There is no rounding to subtract.

---

## Usage by surface type

| Surface | Token | px |
|---|---|---|
| **All component shells** — buttons, inputs, selects, textareas, search/file/number/phone fields, cards, modals, dropdown & menu panels, alerts, accordions, tabs panels, pagination, tables, tooltips, badges, chips | `radius-xxl` | 0 |
| **Functionally round controls** — toggle track, avatars, status dots, radio, range, spinners | `radius-full` | 999px |
| Checkbox tick box | `radius-none` | 0 |
| Nested children inside a shell (menu items, inset cells) | `radius-none` | 0 |
| Oversized hero / feature panels | `radius-xxl` | 0 |
| Flush lists, table cells, dividers | `radius-none` | 0 |

---

## Prohibited

- **No raw px/rem in components** — use a `radius-*` token.
- **No rounded component shells** — Enhanced shells are square (`radius-xxl`, 0px). Do not ship 4px/8px/12px control corners; that is a different theme, not Enhanced.
- **No rounded buttons, cards, inputs, or badges** — every box-shaped surface is square (0px); only functionally-round controls use `radius-full`.
- **No `radius-full` on box surfaces** — full rounding is for the toggle track, avatars, radio, range, and naturally round controls only, never page panels, cards, buttons, or badges.
- **No off-scale values** (e.g. 6px, 10px) — add a token to this file if the scale is insufficient.
- **No copying a `radius-full` value onto box children** — items inside a square panel stay square (`radius-none`).
- **No mixing step names from foreign systems** — if a token exists here, use its name.
