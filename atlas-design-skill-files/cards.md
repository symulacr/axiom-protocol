# Cards — TypeUI · Enhanced

> **TypeUI · Enhanced** — the system's primary content surface.
> Depends on: `colors.md`, `radius.md`, `shadows.md`, `spacing.md`, `typography.md`, `buttons.md`, `tabs.md`

The card is the face of Enhanced: a clean surface with a **hairline `default` (`#E8E8F8`) border**, **no shadow**, the signature **square** (`radius-xxl`, 0px) corners, and generous `spacing-6` padding. A card always carries the **same background color as the section it sits on** — `#FFFFFF` on content sections, `#1313BA` on the hero/footer — so separation comes from the border alone, never a lighter fill and never a drop shadow. Cards do the bulk of the layout work — articles, products, profiles, pricing, dashboards — so they stay calm and let their content lead.

---

## Anatomy

| Part | Role |
|---|---|
| **Root** | Bordered, rounded surface |
| **Media** | Optional top or side image |
| **Header** | Title + optional meta |
| **Body** | Description, lists, form fields |
| **Footer** | Actions, links, meta row |
| **Badge / tag** | Optional status label |
| **Tabs** | Optional nav tabs in header (see `tabs.md`) |

---

## Layout

| Property | Token / value |
|---|---|
| Background | Same as the section it sits on — `neutral-secondary-soft` (`#FFFFFF`) on content sections; `brand` (`#1313BA`) on the hero/footer |
| Border | `default` (`#E8E8F8`), 1px — the only separation from the section |
| Radius | `radius-xxl` (0px, square) |
| Shadow | None (`elevation-none`) |
| Padding (default) | `spacing-6` |
| Max width | Content-driven (~384px for demo cards); full width in grids |
| Gap title ↔ body | `spacing-3` |
| Gap body ↔ footer actions | `spacing-6` |
| Gap between footer buttons | `spacing-4` |
| Hover (clickable card) | Border deepens toward `default-strong` — the background stays equal to the section; no fill shift, no shadow |

### Horizontal card

Media column ~40% width; body column padded `spacing-6`; stacks vertically below the tablet breakpoint.

### Image top

Media bleeds to the top edge; its top corners follow the root `radius-xxl` and its bottom edge sits square against the body.

---

## Typography

Card titles stay quiet — `font-size-2xl` is the ceiling inside a standard card. Display type belongs to the page, not the card.

| Element | Size | Weight | Line height | Color |
|---|---|---|---|---|
| Card title | font-size-2xl | font-weight-semibold | line-height-heading | `heading` |
| Card subtitle / meta | font-size-sm | font-weight-normal | line-height-body | `body-subtle` |
| Body | font-size-sm | font-weight-normal | line-height-body | `body` |
| Footer link | font-size-sm | font-weight-medium | line-height-body | `fg-brand` |
| Price / stat emphasis | font-size-xl | font-weight-bold | line-height-heading | `heading` |

---

## Variants

Every variant is the same shell — bordered, shadowless, section-aware surface, square corners — rearranged around its content.

### Default

Title + body; the whole card may be a single link.

### With button

Body plus a primary button (`buttons.md` base size) in the footer; an optional trailing icon on the button.

### With text link

The CTA is an `fg-brand` underlined link instead of a button — for lower-stakes follow-through.

### With image

Image above or beside the content; outer-edge radius rules still apply.

### With description only

Longer body copy at the same padding.

### Horizontal

Side-image layout for lists and featured entries.

### User profile

A circular avatar (64–96px) centered above the name, then role, a stats row, and action buttons; an optional dropdown menu in the corner.

### With form

Stacked inputs in the body and a submit button in the footer; field spacing `spacing-4`–`spacing-5`.

### E-commerce

Image, title, price, rating, add-to-cart — the price row uses the stat typography.

### Call to action

Centered copy and a single primary button; emphasis comes from a `brand` border, not a fill — the background still matches the section.

### With tabs

A tab strip in the header with panel content below; the tab model is delegated to `tabs.md`.

### With list

Icon + text rows in the body; list item padding `spacing-2`–`spacing-3`.

### Pricing

Tier name, price, feature list, and CTA — the highlighted tier is marked by a `brand` border (in place of the default `#E8E8F8`), never a different fill; its background still matches the section.

### Testimonial

Quote body, avatar, and author name — the quote may step up to `font-size-md`.

### Crypto / stats

A large metric, a delta badge, and a sparkline area — the badge follows `badges.md`.

---

## Shadow & elevation

Cards are flat — separation is read from the `default` (`#E8E8F8`) border alone, never a shadow or a fill shift. The card background always equals its section.

| State | Surface |
|---|---|
| Resting | Same background as the section (`#FFFFFF` on content sections, `#1313BA` on hero/footer) + `default` border |
| Hover (interactive) | Background unchanged; border deepens toward `default-strong`; no shadow |
| Inset card (inside another card) | Same background as its parent/section; its own `default` border is what reads it apart — never a different fill |

---

## Accessibility

- A clickable whole card is one link wrapping the card **or** a heading link plus distinct buttons — never nested interactive elements.
- Images carry meaningful `alt`, or `alt=""` when decorative.
- Tab cards follow the keyboard model in `tabs.md`.

---

## Prohibited

- **No corners other than `radius-xxl`** (0px, square) and no raw hex — a card that is rounded isn't an Enhanced card.
- **No shadows on cards** — they are flat; separation comes from the `default` border and surface tone, not `elevation`.
- **No borderless cards** — every card carries the hairline `default` (`#E8E8F8`) border; do not drop it and rely on a shadow.
- **No card fill that differs from its section** — the card background always equals the section it sits on (`#FFFFFF` on content, `#1313BA` on hero/footer); separation is the `default` border alone, never a lighter, derived, or tinted fill. Emphasis uses a `brand` border, not a fill change.
- **No heavy or colored card borders** — the border is the single hairline `default` (`#E8E8F8`); do not thicken it or swap it for an accent unless a status card calls for an intent edge.
- **No full-width hero typography inside default cards** — that lives in the page section, not the card.
- **No two competing primary CTAs** without hierarchy (one filled, one link).
- **No framework class names** in specs.
