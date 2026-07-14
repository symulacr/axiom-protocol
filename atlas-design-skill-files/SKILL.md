# TypeUI · Atlas — Design System

> **⚠️ READ FIRST — NON-NEGOTIABLE.** Do **not** design, build, or write any component, section, or page until you have **carefully read every `.md` file in this directory**. Read them all first, *then* consciously decide what to create — only after that may you build components, sections, and pages. There are no exceptions.

This skill is the **authoritative visual specification for TypeUI Atlas** (from [typeui.sh](https://www.typeui.sh)). Everything you build for this project — every component, layout, and page — follows the module files bundled here. They define *what Atlas looks like* down to the token; you decide how to implement it (CSS, Tailwind, styled-components, anything), but you implement this design — you do not redesign it.

**The canonical specs are the `*.md` files in this directory.** Read the full module before you write UI for it. A nested skill folder may ship short summaries; those are wayfinding only and link back to these files.

---

## What Atlas is

Atlas is a **polished, production-grade TypeUI design system** expressed as **stack-agnostic design tokens**. Its character is clean, technical, and quietly confident: one white content surface with the brand reserved for hero and footer, a saturated **indigo** brand (`#1313BA`), **square corners**, and hairline `#E8E8F8` borders instead of shadows. The result should feel *precise and crisp* — never noisy, never floating. If a screen built from these modules reads as rounded, shadowed, or softly tinted, it isn't Atlas yet.

### Signature traits — non-negotiable

These are what make a screen recognizably Atlas. Hold every one of them, on every surface:

- **0px (square) corners on every component shell** (`radius-xxl`) — buttons, inputs, cards, modals, menus, alerts, tabs, tables, tooltips, badges. This is the defining trait; rounded control corners are a different theme. See `radius.md`.
- **Functionally round controls only** (`radius-full`, 999px) — the toggle track, avatars, radio, range, status dots; everything box-shaped stays square.
- **Inter on a compact scale** — a 14px (`font-size-sm`) control and body baseline under a disciplined heading ramp, so UIs read clean, modern, and competent. See `typography.md`.
- **One content surface + brand for hero/footer only** — every content section uses the same white surface (`neutral-secondary-soft`, `#FFFFFF`); the brand surface (`#1313BA`) is reserved for the hero and footer only (with white text) and is never alternated into content sections; cards match their section's background and separate by a `#E8E8F8` border alone; `brand` (indigo, with a `white` label) / `fg-brand` carry the primary action and links; `success` / `danger` / `warning` appear only for real state, never decoration. See `colors.md`.
- **Bordered, shadowless resting surfaces** — separation comes from the hairline `default` (`#E8E8F8`) border and spacing — never a drop shadow or a fill shift — under a brand focus ring on every interactive element. See `shadows.md`.

---

## How to use this skill

1. **Load the foundation first.** For any UI work, read `colors.md`, `typography.md`, `spacing.md`, `radius.md`, and `shadows.md` before anything else — every component depends on them.
2. **Add a module per element on the page.** A modal form with inputs and buttons means `modal.md` + `input-field.md` + `buttons.md`. Don't write JSX/CSS until the relevant specs are loaded.
3. **Cross-reference.** Components inherit from each other — a search bar satisfies the search section in `input-field.md`; a table footer pulls in `pagination.md`.
4. **Trust these files over memory or external docs.** When this skill and third-party UI documentation disagree, this skill wins.

### Suggested reading by task

| Task | Read at minimum |
|---|---|
| Landing / marketing page | foundation + `buttons.md`, `cards.md`, `alerts.md` |
| Form page | foundation + `input-field.md` + relevant form modules + `buttons.md` |
| Dashboard | foundation + `tables.md`, `tabs.md`, `dropdowns.md`, `badges.md` |
| Settings | foundation + form modules + `toggle.md`, `checkbox.md`, `radio.md` |
| Overlay / dialog | `modal.md` or `drawer.md` + the content modules inside |

---

## Operating rules

- **Tokens are the vocabulary, and they are agnostic.** `neutral-primary-soft`, `heading`, `default-medium`, `spacing-4`, `radius-xxl`, `elevation-1` are Atlas tokens, not framework utilities — map them into your stack's token layer.
- **Hold the signature radius.** Shells are `radius-xxl` (0px, square); only functionally round controls (toggle track, avatars, radio, range) use `radius-full`. Shipping rounded corners quietly breaks the theme.
- **Bordered and flat.** No resting card or component wears a drop shadow (floating overlays — dropdowns, menus, popovers — are the one documented exception and carry a real medium shadow; see `dropdowns.md`). A card matches the background color of its section and separates with a hairline `default` (`#E8E8F8`) border alone — never a lighter or derived fill. Inputs and every other control (select, textarea, checkbox, radio, toggle) also match the background of the surface they sit on and are defined by a `default` (`#E8E8F8`) border — never a contrasting fill. Outline buttons carry a 2px border. Classic, solid buttons (see `buttons.md`).
- **One content surface; brand for hero/footer only.** Every content section uses the same white surface (`neutral-secondary-soft`, `#FFFFFF`). The brand surface (`#1313BA`) is used only on the hero and footer (with white text) — never alternated into ordinary content sections, and never a third color.
- **Equal vertical breathing room between sections.** Every section carries the **same spacing above and below it** — the top padding/margin of a section equals its bottom padding/margin, and the gap between any two adjacent sections is symmetric. No section gets more air on one side than the other; rhythm comes from this consistent, balanced spacing, never from uneven gaps.
- **Foundation values are law.** Never invent a color, size, radius, or shadow that contradicts the foundation files — if no token fits, the foundation file is where a new one gets added.
- **Every interactive element earns its states.** Hover, focus, and disabled are defined in each module; the brand focus ring is never removed without an accessible equivalent.
- **Semantic HTML, always.** Proper `h1`→`h6` order, `<button>` for actions, `<a>` for navigation, real labels on form controls, and ARIA where a module calls for it.
- **No vendor leakage.** Describe and implement through Atlas tokens; never paste third-party component class strings from external docs into the work.
- **Form controls share one shell.** Text-like controls (`input-field`, `select`, `textarea`, …) inherit the field shell in `input-field.md` unless a module explicitly overrides it.
- **Themed form controls.** Checkboxes, radios, and toggles always render in **this theme's own style** — the theme `brand` fill when checked / selected / on, plus the theme's surface, border, radius, and focus-ring tokens — never the native/unstyled browser control and never another theme's colors. **Reset the native input** (`appearance: none`) and draw the control yourself — a native `accent-color` tint alone is **not** enough, it still renders the OS control: build the box / track, the checked `brand` fill, the check / dot / thumb mark, and the focus ring from this theme's tokens. See `checkbox.md`, `radio.md`, `toggle.md`.
- **Real icon library.** Use a proper icon library — **FontAwesome Free or Lucide** (or an equivalent that fits your stack) — for every UI icon, sized and colored with the theme's tokens, and **use the outline / line style, never solid/filled icons**. Never hand-roll one-off inline SVGs, emoji, or icon-font glyphs for interface icons.
- **Real charts on dashboards.** When building an application, dashboard, or widget with data visualization, render it with a **real charting library** (e.g. Recharts, Chart.js, ECharts, visx, or your stack's equivalent) bound to real data and styled with the theme's color tokens — never a static image, CSS-bar mock, or placeholder graphic.
- **Spacing comes from the fundamentals.** Take every margin, padding, and gap from the scale in `spacing.md` (never ad-hoc px). Always give **headings and paragraphs room above and below**, and **pad both sides of any border, separator, or divider** so content never crowds a rule. See `spacing.md` and `typography.md`.
- **Navbar & footer links are text links, not buttons.** A link in the navbar or footer has **no padding and no background/fill hover** — it is **not** a ghost button. On hover it only **lightens its text color** (a subtle lighter/dimmer text tone) because it is a link, not a button. Reserve padded, background-hover treatments for real buttons and sidebar nav items. Adjacent nav links sit **24px** apart.
- **Section width: max 1280px, centered.** Every section's content sits in a **centered container with a max-width of `1280px`** (equal auto left/right margins). Sections are always horizontally centered — never left/right-aligned or off-center, and never wider than 1280px of content. A full-bleed background may still span the viewport, but the **content is capped at 1280px and centered**.
- **Section header → content gap: at least 64px (margin-bottom).** The **section heading block** — the section heading, plus any lead paragraph and/or buttons that belong with it — is separated from the **rest of the section's content** by a minimum of **64px**. Keep the heading, its paragraph, and its CTA buttons together as one intro block (their own internal gaps follow `typography.md` / `spacing.md`), then leave **≥ 64px** below that whole block before the body content begins.
- **Section header max-width: 768px.** A section header — made up of any combination of an eyebrow, a heading, a supporting paragraph, and/or buttons (whichever the section uses) — is capped at **768px** wide (centered for centered headers, left-aligned within that measure otherwise) so the heading and lead wrap to a comfortable line length instead of stretching the full section width.
- **No decorative dashes or numbering in copy.** Never trail a word or label with a dangling dash flourish (e.g. `platform —`), and never number eyebrows, section labels, steps, or list items with zero-padded or hashed sequences (`01`, `02`, `#1`, `#2`). Eyebrows and headings are plain words: no dash "lines", no decorative counters.
- **No duplicate borders between sections.** Where two adjacent sections (or stacked cards, rows, widgets, list items) share an edge, **only one of them draws that border** — never both. If a section has a bottom border, the next section does **not** also add a top border, so the shared line stays a single hairline, never a doubled 2px line. Pick one direction (e.g. bottom-only) and apply it consistently; the last element omits the trailing edge.
- **Input focus = a lighter shade of its own fill.** On focus, an input's border and ring are the **same colour as the input's own background, lightened** (a lighter tint of the field fill) — a soft glow that reads as active without introducing a foreign colour.
- **Chart tooltip items take the series colour.** In a chart tooltip, each listed item — its swatch, label, and value — is rendered in **that series' chart colour**, so the tooltip maps 1:1 to the lines/bars it describes.
- **Button type & icon sizes.** Button label is **max 16px on base and large** buttons and **14px on small** buttons. The **gap between a button's icon and its label is 6px**.
- **Icon sizing.** An **18px icon is reserved for extra-large** contexts only; default UI icons stay smaller (≈14–16px). **Breadcrumb icons are ≤ 14px.** Always the outline style (see the icon-library rule).
- **Dropdown panel border & shadow.** Every dropdown / menu panel carries a **border in its own background colour, darkened just enough to be visible** — a subtle darker edge of the panel's own fill, never a harsh contrasting line — plus a **medium drop shadow** so the menu lifts cleanly off the page.
- **Dropdown menus never scroll by default.** A dropdown / menu panel shows **all of its content at once** — no internal scrollbar, no capped `max-height`, no `overflow: auto/scroll`. Every item is visible and the panel grows to fit its items. Add a scroll area **only when the prompt explicitly asks for it** (e.g. a long searchable list); absent that instruction, never clip or scroll the menu. The panel always carries the **medium shadow** (see the dropdown panel rule above).
- **One hover background for every link surface.** Wherever a link or menu item shows a **background on hover** — top-nav links, sidebar links, dropdown / menu items, command-palette rows, tab-style links — it uses the **same single hover-background tint** (one subtle neutral fill), so the hover feedback is identical across navbars, sidebars, and dropdowns. Choose one value for this and reuse it everywhere — never give the sidebar one hover colour and the dropdown another. The **active / selected** state is a separate, stronger background (a brand tint), likewise reused consistently across all of these surfaces.
- **Selected table rows use the neutral hover background, not a brand tint.** A selected row takes the **same subtle neutral background a row shows on hover** — never a blue / brand-tinted fill. A row that is both **selected and hovered stays that exact same colour** (no deepening, no shift). Selection is signalled by the row's checkbox / control state, not by recolouring the row.
- **One element owns the vertical padding — never two nested.** When a band, card, or CTA sits inside a section, **only one of them adds vertical padding**. A section and an inner band must not both pad top/bottom, or the block bloats and reads off-center. Decide which container owns the vertical rhythm and zero the padding on the other.
- **Reset native element margins inside cards.** Elements the browser margins by default — `<blockquote>`, `<figure>`, `<p>`, `<ul>` / `<ol>` — are set to **`margin: 0`** whenever they are, or sit inside, a card. Otherwise the user-agent's default margin leaks **outside** the card border and reads as phantom padding around the box (a `<blockquote>` testimonial card is the classic trap). All spacing comes from the card's own padding. Also delete dead modifier classes that style nothing (e.g. unused `--1` / `--2` / `--3` variants).
- **Never delete a CSS rule without proving nothing uses it.** Before removing or "deduplicating" any style, **search the whole codebase for every class / selector it targets** (markup, components, templates, JS) and confirm **zero** references remain. A selector that appears only once in the stylesheet is **not** dead if any element still carries that class — deleting it drops that section to **unstyled HTML**. Deduplicate by **consolidating** repeated declarations into one rule, never by blindly deleting; when in doubt, keep it. After any CSS cleanup, **load the page and confirm every section still renders styled** — then hard-refresh (the dev server may still serve the old CSS bundle).
- **Zero a list's default left padding, not just its margin.** A `<ul>` / `<ol>` used as a layout row, nav, or menu carries the browser's default **~40px left padding** (`padding-inline-start`, reserved for bullets) — `margin: 0` and `list-style: none` do **not** remove it. Explicitly set **`padding: 0`** (or `padding-inline: 0`); if you only set `padding-block`, that left inset stays and the whole row is pushed ~40px inward, misaligning it with the logo / page container. Let the page container own horizontal alignment — the list contributes no indent of its own.
- **Sidebar links: the same lighter background on hover and active.** Every nav link in a sidebar shows a **background fill on both hover and its active / current state, and it is the same fill** — a shade **lighter than the sidebar's own background** so it reads clearly against it. The fill's corners **follow this theme's radius convention** — a pill where the theme is pill-shaped, the theme's standard rounded step otherwise, never a foreign radius. Hover and active look identical in shape and colour; the active item may add a text / icon emphasis (weight or a brand tint) but the background stays that one shared lighter fill.
- **Navbar buttons: one small size, one weight; no underlines on nav / sidebar links.** In a navbar, **every button is the small size** — never mix small with base or large — and **all navbar buttons share the same size and the same text font-weight**, so the bar reads consistent. And **underlined text is never allowed, in any state** (default, hover, focus, active), for **navbar links, navbar buttons, or sidebar links / buttons** — these navigation targets signal interactivity through colour and background, never an underline.
- **Translucent backgrounds must blur what's behind them.** Any element with a **semi-transparent / translucent fill** — a sticky or floating navbar, a frosted card, an overlay, a glass panel — **must** pair that translucency with a **backdrop blur** (`backdrop-filter: blur(...)`, plus the `-webkit-backdrop-filter` prefix for Safari). Without it, page content scrolling **underneath** shows through razor-sharp and reads as a confusing jumble. The blur turns the see-through fill into frosted glass so the element stays legible over anything; keep a tint *with alpha* under the blur so text holds its contrast, and fall back to an opaque fill where `backdrop-filter` is unsupported. (A fully opaque background needs no blur — this applies only when the fill has alpha.)
- **Badges are always width auto — never full-width.** A badge / tag / chip / status pill sizes to **its own content** (`width: auto`, an `inline-flex` / `inline-block` box that hugs its label + optional icon). It **never stretches to fill its container** — no `width: 100%`, no block/flex that spans the row, no `flex: 1`, no `align-items: stretch` pulling it edge-to-edge. Several badges in a row sit side by side (and wrap) at their natural widths, each only as wide as its text.
- **Pricing card: 24px between the price and the CTA button.** In a pricing card, leave **24px** between the **price line** (e.g. `$249/month`) and the **CTA button** tied to it — this is the default gap unless a prompt specifies otherwise. Apply it consistently across every tier so the prices and buttons line up row-to-row.
- **Avatar-only triggers carry no chevron.** In a navbar / top bar, an **avatar shown on its own** (just the photo / initials circle) is itself the trigger — do **not** put a chevron caret beside a bare avatar. A chevron is added **only when the avatar is paired with a visible label** (the person's name / role): `avatar + name → chevron` is fine, `avatar alone → no chevron`. A lone avatar plus a chevron reads as clutter; the avatar is already the affordance.
- **Joined input + button groups square the shared edges.** When an input is **attached to buttons (or addons) on its left and/or right** — a search-with-button, a stepper, a prefix/suffix group, any segmented control where an input touches a button — the **touching edges are squared to `0` radius** so the pieces read as one seamless control. An input with a button on **both sides** has **no border radius at all**; with a button on one side it keeps the theme's radius on the free side and `0` on the joined side. Only the **outer corners of the whole group** carry the theme's normal radius. Critically, the input's **focus border / ring must follow that squared corner too** — never let a rounded corner (or a rounded focus outline) peek out at the seam when the input is focused; the focus state matches the 0-radius joined edge exactly.
- **Card headings are 20px.** A card's heading / title — ecommerce & product cards, feature cards, pricing cards, testimonial and content cards, and cards in general — is **20px**. The **one exception is dashboard / application widgets**: a widget's heading follows the smaller, dense widget-title scale, not this 20px card-title size.
- **Ecommerce navbar collapses to one row on mobile.** On narrow viewports (**< 768px**) the ecommerce header is a **single bar** — logo at the inline start, a **hamburger menu button** at the inline end. The desktop secondary content **collapses off the bar**: the search field, cart / account actions, and the whole category row are **hidden** and move into a **menu panel that opens below the bar** (search + category links + a **"View all categories"** entry). On desktop the full **two-level layout** returns — search + logo + cart / account on the top row, categories on a row beneath. Use the **same hamburger + collapsible-panel pattern as the marketing navbar** so both headers behave consistently.
- **No double bottom padding on the footer.** If the footer's **last row / level already carries its own bottom padding** (a bottom bar, a copyright row, the last column block, etc.), **do not also add `padding-bottom` to the whole footer container** — the two stack and the footer's bottom gap balloons. Pick a single owner of the bottom spacing: either the container's `padding-bottom` **or** the last row's padding, never both. The footer's bottom breathing room should match its other internal spacing, not read as doubled.
- **Textarea corners cap at 16px.** A `textarea` (multi-line field) takes a **maximum 16px corner radius** — never the pill / fully-round (999px) rounding that single-line inputs or buttons may use. A 999px radius on a tall multi-line box bows the sides and looks broken; keep textarea corners ≤ 16px so the field reads as a clean rectangle.
- **Application widget grid gap is 16px.** On application / dashboard pages, the gap between widgets in the layout grid — both the row and column gutters between cards/widgets — is **16px**.
- **Hero H1: 72px minimum, 1024px max-width.** The hero's `h1` is the largest type on the page — **at least 72px** font-size, never specced smaller (it may scale down only on narrow mobile viewports for fit). Its text wraps within a **1024px** max-width so a long headline breaks onto a tight, readable column instead of running full-width. The supporting paragraph (hero lead) that follows the H1 is **20px** on large screens and scales **smaller on mobile** (≈16–18px), with **36px margin above and below** it — separating it from the H1 above and the CTAs / content below.
- **Mockup spacing.** When a mockup or visual (screenshot, app preview, product shot, device frame, illustration) is stacked with text above or below it, leave **~52px** between the mockup and the adjacent content — both above and below — so the visual reads as its own block and never crams against the copy.
- **Prohibited sections are binding.** Each module closes with hard constraints — treat them as such, not as suggestions.

---

## Module index

### Foundation — read first for any UI work

- [colors.md](colors.md) — semantic background, text, border, and status color tokens
- [typography.md](typography.md) — heading scale, body text, labels, links, weights
- [spacing.md](spacing.md) — spacing scale (`spacing-*`) for padding, margin, and gap
- [radius.md](radius.md) — border-radius scale (`radius-xs` … `radius-full`) and the 0px square convention
- [shadows.md](shadows.md) — elevation tokens (`elevation-none` … `elevation-5`)

### Actions & content

- [buttons.md](buttons.md) — button variants, sizes, states
- [button-group.md](button-group.md) — grouped buttons, toolbars, pagination groups
- [cards.md](cards.md) — card structure, media, actions
- [alerts.md](alerts.md) — inline feedback messages (success, error, warning, info)
- [badges.md](badges.md) — labels, counts, status chips
- [breadcrumb.md](breadcrumb.md) — breadcrumb navigation

### Form controls

Shared shell and validation patterns live in [input-field.md](input-field.md).

- [input-field.md](input-field.md) — single-line text, email, password, URL, groups, search, validation
- [file-input.md](file-input.md) — file upload, multi-file, dropzone
- [number-input.md](number-input.md) — numeric entry, steppers, currency, PIN
- [phone-input.md](phone-input.md) — tel, country code, OTP verification
- [select.md](select.md) — native select and custom dropdown trigger
- [textarea.md](textarea.md) — multi-line text, comment box, chat input, editor chrome
- [timepicker.md](timepicker.md) — time entry, ranges, presets
- [checkbox.md](checkbox.md) — multi-select, list groups, bordered options
- [radio.md](radio.md) — single-select, list groups, advanced card pickers
- [toggle.md](toggle.md) — on/off switch
- [range.md](range.md) — horizontal slider

### Navigation & structure

- [accordion.md](accordion.md) — expandable sections
- [tabs.md](tabs.md) — tab navigation (default, underline, pills, vertical)
- [pagination.md](pagination.md) — page navigation, table pagination
- [dropdowns.md](dropdowns.md) — dropdown menus, items, dividers

### Overlays & feedback

- [modal.md](modal.md) — modal dialogs, form modals, sizes, placement
- [drawer.md](drawer.md) — slide-in panels, navigation drawer
- [tooltips.md](tooltips.md) — tooltips, placement, triggers

### Data display

- [tables.md](tables.md) — table structure, sorting, selection, pagination

---

## Canonical vs. summary files

Some installs ship two layers:

| Layer | Where | Use for |
|---|---|---|
| **Canonical modules** | This directory (`colors.md`, `buttons.md`, …) | Full anatomy, tokens, states, accessibility, and prohibited rules — read before implementing |
| **Summary stubs** | Optional nested skill folder (e.g. `.agents/skills/`, `.cursor/`) | Quick orientation and links into the canonical modules |

Summaries are indexes, not substitutes. If a stub and a module ever disagree — on a color, a size, a variant, anything — **the module in this directory wins.**
