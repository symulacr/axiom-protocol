# Color Tokens — TypeUI · Enhanced

> The color system for **TypeUI · Enhanced**. Enhanced is built on one calm **white** content surface carrying a single, confident **indigo** brand (`#1313BA`). The saturated brand surface is reserved for the **hero and footer only** — every other section uses the white surface, never alternating into brand. Surfaces read crisp and squared, and cards sit on their section with the **same background color**, separated by a hairline **`#E8E8F8`** border rather than a shadow. Status hues (success, danger, warning) appear *only* when something truly is success, danger, or warning; they are never decoration. Every value below is a literal hex and the single source of truth; components reference semantic tokens, never raw hex or palette steps directly.

---

## Token naming

| Pattern | Role |
|---|---|
| `body`, `heading`, `body-subtle` | Default text hierarchy |
| `fg-{intent}` | Foreground / text for brand, status, accent |
| `neutral-{level}-{accent}` | Neutral surfaces (backgrounds) |
| `brand`, `brand-soft`, `brand-strong` | Brand surfaces |
| `success`, `danger`, `warning` (+ `-soft`, `-medium`, `-strong`) | Status surfaces |
| `default`, `light`, `muted`, `buffer` | Border intent |
| `{accent}` | Standalone accent surfaces (purple, cyan, teal, etc.) |

**Level:** `primary` · `secondary` · `tertiary` · `quaternary`  
**Accent (surface):** `soft` · `medium` · `strong` · `strongest`  
**Foreground accent:** `subtle` · `strong`

---

## Semantic tokens — text

| Token | Hex |
|---|---|
| body | `#6363C6` |
| body-subtle | `#9090CE` |
| heading | `#1313BA` |
| fg-brand-subtle | `#CACAF0` |
| fg-brand | `#1313BA` |
| fg-brand-strong | `#0E0E8C` |
| fg-success | `#15803D` |
| fg-success-strong | `#14532D` |
| fg-danger | `#C81E1E` |
| fg-danger-strong | `#771D1D` |
| fg-warning-subtle | `#B45309` |
| fg-warning | `#7C2D12` |
| fg-yellow | `#CA8A04` |
| fg-disabled | `#AEAED2` |
| fg-purple | `#9333EA` |
| fg-cyan | `#0891B2` |
| fg-indigo | `#1313BA` |
| fg-pink | `#D61F69` |
| fg-lime | `#65A30D` |

---

## Semantic tokens — background

### Neutral

| Token | Hex |
|---|---|
| neutral-primary-soft | `#FFFFFF` |
| neutral-primary | `#FFFFFF` |
| neutral-primary-medium | `#FFFFFF` |
| neutral-primary-strong | `#FFFFFF` |
| neutral-secondary-soft | `#FFFFFF` |
| neutral-secondary | `#FFFFFF` |
| neutral-secondary-medium | `#FFFFFF` |
| neutral-secondary-strong | `#FFFFFF` |
| neutral-secondary-strongest | `#FFFFFF` |
| neutral-tertiary-soft | `#F4F4FC` |
| neutral-tertiary | `#F0F0FA` |
| neutral-tertiary-medium | `#E8E8F8` |
| neutral-quaternary | `#E0E0F2` |
| neutral-quaternary-medium | `#D6D6EE` |
| gray | `#C4C4E0` |

### Brand

| Token | Hex |
|---|---|
| brand-softer | `#E8E8F8` |
| brand-soft | `#CACAF0` |
| brand | `#1313BA` |
| brand-medium | `#8989DD` |
| brand-strong | `#0E0E8C` |

### Status

| Token | Hex |
|---|---|
| success-soft | `#ECFDF3` |
| success | `#15A34A` |
| success-medium | `#D1FADF` |
| success-strong | `#15803D` |
| danger-soft | `#FFF1F2` |
| danger | `#BE123C` |
| danger-medium | `#FFE4E6` |
| danger-strong | `#9F1239` |
| warning-soft | `#FFFAEB` |
| warning | `#F97316` |
| warning-medium | `#FFEDD5` |
| warning-strong | `#C2410C` |

### Utility & accent

| Token | Hex |
|---|---|
| dark-soft | `#2A2A75` |
| dark | `#16164A` |
| dark-strong | `#0C0C2E` |
| disabled | `#ECECF8` |
| purple | `#A855F7` |
| sky | `#0EA5E9` |
| teal | `#0D9488` |
| pink | `#D61F69` |
| cyan | `#06B6D4` |
| fuchsia | `#C026D3` |
| indigo | `#1313BA` |
| orange | `#FB923C` |

---

## Semantic tokens — border

| Token | Hex |
|---|---|
| buffer | `#FFFFFF` |
| buffer-medium | `#FFFFFF` |
| buffer-strong | `#FFFFFF` |
| muted | `#F4F4FC` |
| light-subtle | `#F0F0FA` |
| light | `#E8E8F8` |
| light-medium | `#E8E8F8` |
| default-subtle | `#E8E8F8` |
| default | `#E8E8F8` |
| default-medium | `#E0E0F2` |
| default-strong | `#D6D6EE` |
| success-subtle | `#BBF7D0` |
| danger-subtle | `#FECDD3` |
| warning-subtle | `#FED7AA` |
| brand-subtle | `#CACAF0` |
| brand-light | `#1313BA` |
| dark-subtle | `#16164A` |
| dark-backdrop | `#0C0C2E` |

---

## Light theme registry

Flat token map for the default (light) theme. Implement in your stack’s token layer — theme file, design tokens JSON, variables map, etc.

```
body                          #6363C6
body-subtle                   #9090CE
heading                       #1313BA
fg-brand-subtle                 #CACAF0
fg-brand                        #1313BA
fg-brand-strong                 #0E0E8C
fg-success                      #15803D
fg-success-strong               #14532D
fg-danger                       #C81E1E
fg-danger-strong                #771D1D
fg-warning-subtle               #B45309
fg-warning                      #7C2D12
fg-yellow                       #CA8A04
fg-disabled                     #AEAED2
fg-purple                       #9333EA
fg-cyan                         #0891B2
fg-indigo                       #1313BA
fg-pink                         #D61F69
fg-lime                         #65A30D
neutral-primary-soft            #FFFFFF
neutral-primary                 #FFFFFF
neutral-primary-medium          #FFFFFF
neutral-primary-strong          #FFFFFF
neutral-secondary-soft          #FFFFFF
neutral-secondary               #FFFFFF
neutral-secondary-medium        #FFFFFF
neutral-secondary-strong        #FFFFFF
neutral-secondary-strongest     #FFFFFF
neutral-tertiary-soft           #F4F4FC
neutral-tertiary                #F0F0FA
neutral-tertiary-medium         #E8E8F8
neutral-quaternary              #E0E0F2
neutral-quaternary-medium       #D6D6EE
gray                            #C4C4E0
brand-softer                    #E8E8F8
brand-soft                      #CACAF0
brand                           #1313BA
brand-medium                    #8989DD
brand-strong                    #0E0E8C
success-soft                    #ECFDF3
success                         #15A34A
success-medium                  #D1FADF
success-strong                  #15803D
danger-soft                     #FFF1F2
danger                          #BE123C
danger-medium                   #FFE4E6
danger-strong                   #9F1239
warning-soft                    #FFFAEB
warning                         #F97316
warning-medium                  #FFEDD5
warning-strong                  #C2410C
dark-soft                       #2A2A75
dark                            #16164A
dark-strong                     #0C0C2E
disabled                        #ECECF8
purple                          #A855F7
sky                             #0EA5E9
teal                            #0D9488
pink                            #D61F69
cyan                            #06B6D4
fuchsia                         #C026D3
indigo                          #1313BA
orange                          #FB923C
buffer                          #FFFFFF
buffer-medium                   #FFFFFF
buffer-strong                   #FFFFFF
muted                           #F4F4FC
light-subtle                    #F0F0FA
light                           #E8E8F8
light-medium                    #E8E8F8
default-subtle                  #E8E8F8
default                         #E8E8F8
default-medium                  #E0E0F2
default-strong                  #D6D6EE
success-subtle                  #BBF7D0
danger-subtle                   #FECDD3
warning-subtle                  #FED7AA
brand-subtle                    #CACAF0
brand-light                     #1313BA
dark-subtle                     #16164A
dark-backdrop                   #0C0C2E
```

---

## Usage rules

- **One content surface; brand for hero & footer only.** Every content section uses the same neutral surface, `neutral-secondary-soft` (`#FFFFFF`). The saturated `brand` surface (`#1313BA`) is used **only on the hero and the footer** — it is never applied to ordinary content sections, and sections never alternate into brand. Resolve dark-theme values in your token layer against `#0C0C2E` the same way light resolves against `#FFFFFF`.
- **Hero & footer are brand.** Only the hero band and the footer use the `brand` surface (`#1313BA`); every other section uses the neutral `#FFFFFF` surface.
- **White text on brand surfaces.** On the `brand` surface (`#1313BA`) — the hero and footer — use `white` for headings, body, and inline text so it reads against the saturated background. Never place `heading` (`#1313BA`) text on a `brand` surface.
- **Page & section backgrounds:** `neutral-secondary-soft` (`#FFFFFF`) for all content sections; `brand` (`#1313BA`) for the hero and footer only.
- **Cards & panels match their section's background.** A card always carries the **same background color as the section it sits on** — `#FFFFFF` on content sections, `#1313BA` on the hero/footer — and separates **only** by a hairline `default` (`#E8E8F8`) border. Never give a card a lighter, derived, or different fill from its section, and never a shadow; the border alone defines the card edge.
- **Controls match their surface, defined by a border:** inputs, selects, textareas, checkboxes, radios, and toggles use the **same background color as the surface they sit on** (`#FFFFFF` on a white card/section) and are outlined by a `default` (`#E8E8F8`) border — never a contrasting fill. Focus draws a `brand` border + ring; checked / selected / on states use the `brand` fill. See `input-field.md`.
- **Primary actions:** `brand` background; label uses `white` (the indigo brand is dark and pairs with a light label — never dark text on `brand`).
- **Headings:** `heading` (`#1313BA`) · **Body:** `body` (`#6363C6`) · **Muted:** `body-subtle`.
- **Links / CTAs:** `fg-brand` (`#1313BA`) on neutral surfaces; `white` on brand surfaces.
- **Borders:** cards and component shells carry a `default` (`#E8E8F8`) border; `default-strong` is reserved for genuine dividers and the rare functional edge.
- **Disabled states:** `disabled` background + `fg-disabled` text.
- **Never use raw hex in components** — always reference semantic tokens.

## Prohibited

These rules are non-negotiable unless a product brief explicitly documents an exception and a compensating control.

### Token identity — agnostic by design

- **Semantic tokens are this design system’s vocabulary** — named roles (`body`, `brand`, `neutral-secondary-soft`), not imports from any external palette, framework, or vendor scale. Palette tables in this file are derivation reference only; they are **not** token names and **not** licensed aliases for third-party color systems.
- **Do not label or treat tokens as foreign palette steps** — never refer to `brand` as “indigo 700”, `body` as “violet 500”, or `neutral-quaternary` as “gray 200” in specs, code comments, or handoff. If a token exists, use its name.
- **Do not rename tokens to match another stack** — map *into* your implementation layer (theme file, variables map, design tool styles); do not rename tokens to fit a framework’s naming convention and call that “the design system.”
- **Hex values belong to the token registry** — each semantic token owns one resolved hex per theme. Tokens are the contract; hex is the stored value, not something authors pick at build time.

### Implementation boundaries

- **No raw hex in UI surfaces** — components, layouts, illustrations, and marketing assets must reference semantic tokens only. Hex appears in this registry and in the token layer — nowhere else.
- **No palette steps in product UI** — do not apply base-palette rows directly to buttons, text, borders, or backgrounds. Every color choice resolves through a semantic token.
- **No token chaining** — semantic tokens must not point at other tokens or palette variables (`token-a → token-b → #hex`). Each semantic token holds its own hex so the system stays portable and auditable.
- **No one-off colors for “close enough”** — if no token fits, add a token to this file with documented intent; do not hard-code a nearby hex in a single screen or component.
- **No mixing themes on one surface** — light-registry values and dark-registry values must not be blended on the same element because the other theme “looked better.”
- **Brand surface is hero/footer only** — content sections never use the `brand` (`#1313BA`) background; do not alternate brand into ordinary sections or introduce a third section color. Every content section shares the neutral `#FFFFFF` surface, with brand reserved for the hero and footer.
- **No card fill that differs from its section** — a card always matches the background color of the section it sits on; separation is the `default` (`#E8E8F8`) border alone, never a lighter or derived fill.

### Semantic misuse

- **No brand foreground for long copy** — `fg-brand`, `fg-brand-strong`, and related brand text tokens are for links, labels, badges, and short emphasis — not paragraphs, articles, or legal text. Body copy uses `body` / `body-subtle`.
- **No accent foreground for navigation or body** — `fg-purple`, `fg-cyan`, `fg-pink`, `fg-indigo`, `fg-lime`, and similar accent text tokens are for tags, charts, and inline highlights — not nav items, menu labels, or reading text.
- **No status colors without status meaning** — `success`, `danger`, `warning`, and their `-soft` / `-strong` variants communicate state. Do not use them for decoration, category color-coding unrelated to state, or “making it pop.”
- **No accent backgrounds on full shells** — page backgrounds and section bands use the two allowed surfaces only (`#FFFFFF` and `brand`). Accent fills are for controls, badges, charts, and intentional campaign bands only.
- **No border tokens as fills or text colors** — `default`, `light`, `brand-subtle`, and other border tokens define edges; do not repurpose them as background or typography colors without adding a proper surface or text token.

### Contrast, accessibility, and states

- **No token pairing that fails readable contrast** — when combining text and surface tokens, verify legibility (WCAG 2.2 AA minimum for text). The indigo `brand` in particular pairs with a light (`white`) label, never dark. If a pair fails, change the token assignment or add a dedicated pair to the registry — do not override with raw hex.
- **No disabled styling that looks active** — disabled surfaces use `disabled` + `fg-disabled`; do not reuse `body` or `brand` on disabled controls because they read as clickable.
- **No hover/focus/active colors outside the system** — interaction states must derive from the same semantic set (e.g. a stronger brand step already in the registry), not ad-hoc lightened or darkened hex.

### Governance

- **No silent drift** — changing a token’s hex is a design-system change; update this file, note the reason, and propagate to all platforms. Per-platform hex tweaks break parity.
- **No duplicate tokens for the same job** — if two names resolve to the same role, merge them. Synonym sprawl erodes the agnostic contract.
- **No exceptions without documentation** — breaking any rule above requires naming the exception, the surface it applies to, and why the existing tokens were insufficient.
