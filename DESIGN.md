---
name: Axiom Protocol
description: Verifiable DeFi agents — warm, instrument-like UI for managing ERC-7857 iNFTs on 0G Chain
colors:
  obsidian: "#10100e"
  dark-carbon: "#1c1a17"
  warm-iron: "#2d2a25"
  aged-steel: "#3d3932"
  bright-nickel: "#f5f0e8"
  polished-silver: "#e5dfd6"
  warm-pewter: "#9a9288"
  tarnished-lead: "#736b62"
  burnished-bronze: "#b8976e"
  light-bronze: "#c5a880"
  bronze-wash: "rgba(184, 151, 110, 0.25)"
  bronze-ghost: "rgba(184, 151, 110, 0.08)"
  oxidized-teal: "#5a8a8a"
  faded-teal: "#7aa8a8"
  teal-wash: "rgba(90, 138, 138, 0.15)"
  parchment: "#f0ebe3"
  warm-cream: "#f8f5ef"
  signal-red: "#c85a5a"
  signal-green: "#6b9e6b"
  signal-amber: "#c5a25a"
typography:
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.08em"
  mono:
    fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  "2xl": "32px"
  "3xl": "48px"
  "4xl": "64px"
components:
  button-primary:
    backgroundColor: "{colors.burnished-bronze}"
    textColor: "{colors.obsidian}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.polished-silver}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.warm-pewter}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  card:
    backgroundColor: "{colors.dark-carbon}"
    textColor: "{colors.bright-nickel}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
  card-light:
    backgroundColor: "{colors.parchment}"
    textColor: "{colors.obsidian}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
  input:
    backgroundColor: "{colors.obsidian}"
    textColor: "{colors.bright-nickel}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
---

# Design System: Axiom Protocol

## 1. Overview

**Creative North Star: "The Vault"**

Axiom Protocol's interface is a warm, secure interior: bronze hardware on dark wood, oxidized copper fittings, precious things behind glass. The design serves traders and agent creators who need dense, instrument-like control over their assets. The warmth comes from the material palette itself, not from decoration: tinted neutrals lean toward bronze, surfaces have subtle texture, and the teal secondary accent adds a cool counterpoint like patina on copper.

This system rejects three lanes from PRODUCT.md: crypto-bro aesthetics (neon gradients, rocket emojis, meme-coin vibes), generic SaaS (cream backgrounds, rounded-32px cards, stock illustrations, "empower your workflow" copy), and maximalist DeFi (TVL dashboards with 47 numbers, governance-speak, protocol-politics sidebars). But it also rejects the default dark-mode DeFi template: pure-black backgrounds, cold grays, flat surfaces with no materiality. Axiom has texture. Axiom has warmth. Axiom has a second color.

The system adapts to context. The dashboard is dark and dense (the cockpit). Onboarding, docs, and marketing surfaces use a light parchment variant (the reading room). Both share the same tokens; only the surface assignment changes.

**Key Characteristics:**
- **Warm instrument density.** Information-rich layouts with tight spacing. The feel of a brass-and-wood control panel, not a sterile terminal.
- **Bronze restraint with teal counterpoint.** Bronze is the primary accent (≤10%). Oxidized Teal is the secondary (≤5%), used for data visualization, secondary actions, and informational states. Together they create a warm/cool tension that prevents monotony.
- **Tonal layering with texture.** Depth is conveyed through warm-tinted surface steps and optional noise/grain overlays, not drop shadows. Surfaces have material presence.
- **Dual-surface system.** Dark (obsidian family) for working surfaces. Light (parchment family) for reading surfaces. Same tokens, different assignments.
- **Monospace as authority.** Addresses, hashes, transaction IDs, and proof data use monospace. It signals "this is verifiable data, not marketing copy."

## 2. Colors: The Bronze and Patina Palette

The palette is a warm dark field with two accents: Burnished Bronze (primary) and Oxidized Teal (secondary). Neutrals are tinted toward bronze, not true gray. The warmth is baked into every surface; it doesn't need to be added.

### Primary
- **Burnished Bronze** (#b8976e): The dominant accent. Used on primary buttons, active nav links, monospace label backgrounds, spinner tops, and link hover states. Appears on ≤10% of any dark-mode screen. Its warmth against the tinted dark field is the brand's visual signature.
- **Light Bronze** (#c5a880): Hover and active state for bronze elements. Never used at rest; only as a state transition.

### Secondary
- **Oxidized Teal** (#5a8a8a): The cool counterpoint. Used for data visualization (charts, sparklines, trend indicators), informational alerts, secondary interactive elements, and links that aren't the primary action. Its muted saturation sits beside bronze without competing.
- **Faded Teal** (#7aa8a8): Hover state for teal elements. Lighter and warmer than the base.

### Neutral (Dark Surface)
- **Obsidian** (#10100e): The body background. Near-black with a warm bronze tint. Not #000, not #0f0f0f; the warmth is intentional.
- **Dark Carbon** (#1c1a17): Card, modal, and panel backgrounds. One step above obsidian, still warm.
- **Warm Iron** (#2d2a25): Default borders and dividers. Tinted toward bronze; separation without coldness.
- **Aged Steel** (#3d3932): Emphasized borders (inputs, strong cards, modal edges). The warmest border step.
- **Bright Nickel** (#f5f0e8): Primary text color. Warm near-white; not pure #fff.
- **Polished Silver** (#e5dfd6): Headings and primary UI labels. Slightly dimmer, still warm.
- **Warm Pewter** (#9a9288): Secondary text, muted labels, inactive nav links.
- **Tarnished Lead** (#736b62): Tertiary text, section titles, the quietest readable layer. Reserve for large text (≥14px bold) or non-essential metadata.

### Neutral (Light Surface)
- **Parchment** (#f0ebe3): Light-mode body background. Warm cream, not sterile white. Used for onboarding, docs, marketing.
- **Warm Cream** (#f8f5ef): Light-mode card and panel backgrounds. One step above parchment.

### Semantic
- **Signal Red** (#c85a5a): Error states, danger alerts, destructive actions. Muted, never neon.
- **Signal Green** (#6b9e6b): Success states, confirmations, healthy status indicators. Muted, never neon.
- **Signal Amber** (#c5a25a): Warning states, caution indicators. Warm enough to sit beside bronze without clashing.

### Named Rules

**The 10% Rule.** Burnished Bronze appears on ≤10% of any given dark-mode screen. Its rarity is the point. On light surfaces, bronze can appear more freely (up to 20%) because the warm field absorbs it.

**The Warm Neutral Rule.** Every neutral has a bronze tint. Obsidian, Dark Carbon, Warm Iron, Aged Steel, Bright Nickel, Polished Silver, Warm Pewter, Tarnished Lead: all lean warm. The tint is subtle (you shouldn't notice it consciously), but its absence would feel cold and generic.

**The Teal Counterpoint Rule.** Oxidized Teal appears on ≤5% of any screen. It's the cool voice in a warm conversation: data visualizations, informational states, secondary links. Never use teal for primary actions; that's bronze's job.

**The Dual-Surface Rule.** Working surfaces (dashboard, agent detail, vault) use the dark palette. Reading surfaces (onboarding, docs, marketing) use the light palette. Both share the same accent, typography, and component tokens. The surface assignment is the only difference.

## 3. Typography

**Display Font:** Inter (with system fallbacks)
**Body Font:** Inter (with system fallbacks)
**Label/Mono Font:** SF Mono, Fira Code, JetBrains Mono (with monospace fallback)

**Character:** One family, weight contrast. Inter carries everything from body text to page headings through its weight range (400 → 700). No display font needed; the product's authority comes from density and data, not typographic flourish. Monospace is reserved for verifiable data: addresses, hashes, proofs, transaction IDs.

### Hierarchy
- **Page Heading** (700, 1.5rem / 24px, line-height 1.2, letter-spacing -0.02em): One per page. Appears in PageHeader. Bold weight and negative tracking create presence without scale inflation.
- **Section Title** (600, 0.75rem / 12px, line-height 1.4, letter-spacing 0.08em, uppercase): Labels for content groups. All-caps with wide tracking. Used sparingly; one per logical section, not every heading.
- **Subheading** (600, 1.25rem / 20px, line-height 1.4, letter-spacing -0.01em): Section-level headings within page content.
- **Body** (400, 1rem / 16px, line-height 1.6): Default text. Max line length 65–75ch for prose; data and compact UI can run denser.
- **Label** (500, 0.875rem / 14px, line-height 1.4): Form labels, secondary UI text, nav links.
- **Caption** (400, 0.75rem / 12px, line-height 1.4): Metadata, timestamps, helper text.
- **Mono** (400, 0.875rem / 14px, line-height 1.4): Addresses, hashes, transaction data. Bronze-tinted background (8% opacity) for visual distinction.

### Named Rules

**The One Family Rule.** Inter carries all text. No display font, no body font pairing. Weight contrast (400/500/600/700) creates hierarchy. The product's personality comes from density and data, not typeface choice.

**The Mono Authority Rule.** Monospace signals "this is verifiable data." Addresses, hashes, proof bundles, and transaction IDs use MonoLabel with bronze-tinted background. Never use mono for decorative effect or UI labels.

**The Fixed Scale Rule.** Sizes are rem-based, fixed. No clamp(), no fluid type. Users view product UI at consistent DPI; fluid headings that shrink in a sidebar look worse, not better.

## 4. Elevation

The system is flat by default with optional texture. Depth is conveyed through warm-tonal layering: three surface steps (obsidian → dark-carbon → warm-iron) create visual hierarchy without shadows. Surfaces can carry a subtle noise/grain overlay for materiality, applied via CSS `background-image` with a tiny noise PNG or SVG feTurbulence filter at very low opacity (2–4%).

### Shadow Vocabulary

Shadows appear in exactly one context: modals. The modal uses `box-shadow: 0 24px 80px rgba(0,0,0,0.5)` to lift it above the backdrop. No other component uses shadows.

### Texture

Optional grain overlay for surfaces that need material presence (hero sections, feature cards, onboarding panels). Apply at 2–4% opacity. Never on data-dense areas (tables, lists, dashboards) where it would interfere with readability.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. No card shadows, no button shadows, no ambient glow. The only exception is the modal overlay.

**The Tonal Depth Rule.** When one surface needs to sit above another, step up the warm-toned surface color (obsidian → dark-carbon), not add a shadow.

**The Optional Grain Rule.** Texture is a tool, not a requirement. Use it on hero surfaces and feature areas. Skip it on data-dense dashboards. If it interferes with reading, remove it.

## 5. Components

### Buttons

Three variants, one shape. All buttons share the same radius (6px), padding (10px 20px), font-size (14px), font-weight (600), and transition (0.18s cubic-bezier). The difference is color commitment.

- **Shape:** Gently curved (6px radius). Not pill, not sharp.
- **Primary:** Burnished Bronze background (#b8976e), obsidian text (#10100e), bronze border. The "this does something" button. Used for the primary action on any screen.
- **Secondary:** Transparent background, polished silver text (#e5dfd6), aged-steel border (#3d3932). The alternative action. Visually subordinate to primary.
- **Ghost:** Transparent background, warm-pewter text (#9a9288), no border, tighter padding (8px 12px). Tertiary actions, inline controls, nav-adjacent interactions.
- **Teal (data):** Oxidized Teal background (#5a8a8a), bright-nickel text (#f5f0e8). Used only for data-related actions (refresh, recalculate, export). Never for primary CTAs.
- **Hover:** All variants transition border-color and background at 0.18s. Primary hover shifts to Light Bronze (#c5a880). Secondary hover warms the border toward bronze. Teal hover shifts to Faded Teal (#7aa8a8).
- **Disabled:** 40% opacity, cursor: not-allowed. No color change; the opacity signal is universal.
- **Focus:** 2px outline in bronze with 2px offset. Consistent across all variants.

### Cards / Containers

Two surface variants: dark (default) and light (onboarding, docs).

- **Corner Style:** Softly rounded (12px radius).
- **Dark variant:** Dark Carbon background (#1c1a17), 1px Warm Iron border (#2d2a25). The working surface.
- **Light variant:** Parchment background (#f0ebe3), 1px Warm Iron border (#2d2a25). The reading surface. Text colors invert (obsidian for headings, tarnished-lead for body).
- **Internal Padding:** 24px (var(--space-xl)).
- **Hover (when interactive):** Border transitions to Bronze Wash (rgba(184, 151, 110, 0.25)) at 0.18s. No shadow, no scale.
- **No nested cards.** A card inside a card is always wrong. Use spacing and dividers.
- **Optional texture:** Grain overlay at 2–4% opacity on hero/feature cards. Never on data cards.

### Inputs / Fields

- **Style:** Obsidian background (#10100e), 1px aged-steel border (#3d3932), 6px radius.
- **Padding:** 10px 14px.
- **Focus:** Border shifts to bronze. No glow, no outline beyond the border change.
- **Text:** Bright Nickel (#f5f0e8), 14px.
- **Disabled:** 40% opacity, same as buttons.

### Alerts

Three variants: error, success, info. All use the same structure: tinted background (8–15% opacity), 1px border (20% opacity), semantic text color, 8px radius.

- **Error:** Signal Red background (8%), Signal Red border (20%), Signal Red text.
- **Success:** Signal Green background (8%), Signal Green border (20%), Signal Green text.
- **Info:** Teal Wash background (15%), Oxidized Teal border (20%), Oxidized Teal text. The informational variant uses the secondary accent, not a neutral.

### Modal

Native `<dialog>` element. Dark Carbon background (#1c1a17), aged-steel border (#3d3932), 12px radius, 28px padding. The only component with a shadow (0 24px 80px rgba(0,0,0,0.5)). Max-width 500px, 90vw on mobile. Title uses page-heading style.

### MonoLabel

Inline code-style label for addresses, hashes, and verifiable data. Bronze-tinted background (8% opacity), light bronze text (#c5a880), monospace font, 4px radius. Breaks long strings with `word-break: break-all`.

### Navigation

- **Style:** Sticky top bar, obsidian background (#10100e), 1px warm-iron bottom border (#2d2a25), backdrop-filter blur (12px).
- **Brand:** Bold (700), 20px, bright nickel (#f5f0e8), -0.01em tracking. Links to home.
- **Nav Links:** 14px, medium weight (500). Active state: light bronze (#c5a880). Inactive: warm pewter (#9a9288). Transition: color at 0.18s.
- **Mobile:** Hamburger toggle, full-width dropdown menu.

### Spinner

20px circle, 2px warm-iron border (#2d2a25) with bronze top (#b8976e). Spins at 0.8s linear. Used inline, not centered in content.

## 6. Do's and Don'ts

### Do:
- **Do** use Burnished Bronze (#b8976e) as the primary accent. Its warmth against the tinted dark field is the brand's visual signature.
- **Do** keep bronze to ≤10% of any dark-mode screen. Rarity is the point.
- **Do** use Oxidized Teal (#5a8a8a) as a secondary accent for data visualization and informational states (≤5%).
- **Do** tint all neutrals toward bronze. The warmth is baked in, not added.
- **Do** use tonal layering (obsidian → dark-carbon → warm-iron) for depth instead of shadows.
- **Do** use the light surface (parchment, warm-cream) for reading contexts: onboarding, docs, marketing.
- **Do** use monospace for verifiable data: addresses, hashes, proofs, transaction IDs.
- **Do** maintain instrument density: multiple data points visible without scrolling.
- **Do** use the 0.18s cubic-bezier(0.4, 0, 0.2, 1) transition for all state changes.
- **Do** pair semantic colors with text or icon. Color is never the only signal.
- **Do** use `@media (prefers-reduced-motion: reduce)` for all animations.
- **Do** add subtle grain/texture to hero surfaces and feature areas (2–4% opacity). Skip it on data-dense dashboards.

### Don't:
- **Don't** use neon gradients, rocket emojis, or meme-coin vibes. Per PRODUCT.md: "No crypto-bro aesthetics. Axiom is infrastructure, not a casino."
- **Don't** use cream/sand/beige backgrounds as default, rounded-32px cards, stock illustrations, or "empower your workflow" copy. Per PRODUCT.md: "No generic SaaS. Axiom is a tool, not a template." (Light surfaces are intentional for reading contexts, not a default.)
- **Don't** build TVL dashboards with 47 numbers, governance-speak, or protocol-politics sidebars. Per PRODUCT.md: "No maximalist DeFi. Axiom shows what matters for the agent you're looking at."
- **Don't** use pure-black (#000) or pure-white (#fff) backgrounds. Every surface has a warm tint.
- **Don't** use cold grays (#808080, #999999) without bronze tinting. They break the warm field.
- **Don't** add shadows to cards, buttons, or inputs. The only shadow is the modal overlay.
- **Don't** nest cards. A card inside a card is always wrong.
- **Don't** use gradient text (`background-clip: text` with gradients). Use a solid color.
- **Don't** use side-stripe borders (border-left/right > 1px as colored accent).
- **Don't** use border-radius ≥ 24px on cards or sections. Cards top out at 12–16px.
- **Don't** pair a 1px border with a wide drop shadow (≥ 16px blur) on the same element. Pick one.
- **Don't** use display fonts in UI labels, buttons, or data. Inter carries everything.
- **Don't** use teal for primary actions. That's bronze's job. Teal is informational.
- **Don't** use all-caps body copy. Reserve uppercase for SectionTitle only.
