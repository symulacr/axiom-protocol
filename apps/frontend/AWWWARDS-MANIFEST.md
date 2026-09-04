# AWWWARDS REBUILD — LIVE MANIFEST

> Living plan + verify log for the Axiom Protocol frontend rebuild.
> Updated in real time as stages complete. `before` shots = original design,
> `after` shots = rebuilt design. All verification is live-browser, not code-only.

## Hard rules (non-negotiable)

1. **No AI kickers, no labels, no noisy state.** No eyebrow/kicker spans, no
   numbered mono chips (`01`, `02`), no `// comment`-style card tags, no
   uppercase micro-label spec blocks, no `EXAMPLE DATA`-style noise badges —
   on any page, in any state. Headings speak for themselves.
2. **Dual reduced-motion channel** everywhere: OS `prefers-reduced-motion`
   AND app `[data-reduce-motion="true"]` on `<html>`.
3. **Contracts stay green**: `contrast.test.ts` (index.css token scoping —
   new tokens live in the separate `--aw-*` namespace file), recipe tests,
   copy/i18n wiring, route registry, SEO meta/canonical logic.
4. **RTL-safe motion**: logical properties; parallax is translateY-only.
5. **Cascade**: `axiom-awwwards.css` imported after `index.css`, unlayered —
   wins ties without `!important`.
6. **No new npm dependencies** — all effects are original CSS/canvas
   implementations inspired by (not copied from) canvasui/beam/metal/orbs/
   libraries.dev references.
7. **Commit after every verified stage** — uncommitted sandbox work is volatile.

## Stage plan

| Stage | Scope | Status |
|---|---|---|
| A | FX kit `src/components/fx/fx.tsx` (Reveal, Parallax, ScrollProgress, CountUp, SpotlightCard, GrainOverlay, OrbsField, useReducedMotion) | done — typecheck + tests green |
| B | Design layer `src/styles/axiom-awwwards.css` (`--aw-*` tokens, aurora hero, glass nav, border-beam, marquee ticker, spotlight cards, parallax journey, wordmark footer, console chrome) + `main.tsx` import | done — contrast.test.ts green |
| C | Landing rebuild — cinematic hero (OrbsField + aurora + grain), staggered reveals, CountUp meta, marquee ticker, spotlight principles, parallax journey, wordmark footer; **kicker spans removed** (hero eyebrow, section eyebrows, p-num, j-num) | done — browser-verified |
| D | Public hubs (`/agents`, `/payments`, `/proofs`, `/storage/0g`, `/developers`) — cinematic treatment; **artifact spec-blocks + EXAMPLE/LIVE DATA badges removed** (noisy labels) | done — browser-verified |
| E | Console chrome polish (topbar glass, rail glow, button sweep, panel hairline, page-head type) across app-shell pages | done — verified on /app /transactions /chat /settings /storage /mint /payment /tick /deposit /withdraw /agents/7 (chrome computed styles live, 0 errors each) |
| F | Dev environment: root `.env` (public VITE_* testnet addresses from `.env.example`) so contract-wired routes render | done — `/transfer/co-sign` no longer crashes |
| G | Responsive pass: desktop / tablet / mobile on landing + hubs; reduced-motion, light-theme, RTL spot-checks | done — see verify log |
| H | Final: `bun run test` + `tsc --noEmit` + eslint, manifest summary, commit | done — typecheck 4/4 pkgs, 563 tests 0 fail, lint 0 errors |

## Kicker/noise removal checklist (rule 1)

| Location | Noise element | Status |
|---|---|---|
| Landing hero | `.eyebrow` span ("01 · On-chain agent protocol") | removed + DOM-verified (0 matches) |
| Landing principles | `.section-eyebrow` ("02 // Three principles") + `.p-num` chips | removed + DOM-verified |
| Landing journey | `.section-eyebrow` ("03 // Pick one") + `.j-num` ("// Journey A/B") | removed + DOM-verified |
| All hubs | `.seo-evidence-artifact` blocks (LIVE RECORD / TX HASH / … + EXAMPLE DATA badge) | removed + DOM-verified on all 5 hubs |
| Console pages | kicker-style page-head labels | none found (audit: structural classes only) — verified on all console routes |
| copy.ts | now-unused `eyebrow` keys (en/fr/de) | removed |

## Round 2 — research, OKLCH system, dedup, terse copy (2026-09-03)

| Stage | Scope | Status |
|---|---|---|
| I | Research: opened/searched every shared URL (canvasui, beam, originkit, aicss, transitions.dev, metal, beautiful-ui, agentation, orbs, libraries.dev); saved component recipes + the transitions.dev motion-token scale as local refs (`.design-audit/refs/`) | done |
| J | OKLCH color system in the `--aw-*` layer: ramps (copper 300–500, ink 700–900, paper, mist) → semantic roles (accent / accent-strong / accent-pressed / text / text-soft / ok / info / warn / danger) → legacy aliases; surfaces & lines derived via color-mix instead of re-pinned rgba/hex | done — pixel-faithful (oklch roundtrips to the shipped hexes) |
| K | Contrast gate: `aw-contrast.test.ts` parses the `:root` block, converts oklch→sRGB, asserts AA ≥ 4.5:1 for all state roles on every ink surface + no raw hex pins + tokenized motion ladder; registered in the package test script | done — 6/6, suite now 156/156 |
| L | CSS dedup: `--aw-glass`, `--aw-blur-nav/card`, `--aw-card-grad`, `--aw-shadow-plate/float/lift`, `--aw-hairline`, `--aw-stagger`, `--aw-dur-fast/med` replace repeated literals; console chrome `var(--copper, #d28b52)` fallback pins → ramp fallbacks; `axiom-seo-public.css` palette tokenized (copper rgba → color-mix, paper hexes → tokens) and dead `.seo-evidence-artifact` rules deleted | done |
| M | Terse copy (cognitive-load pass): landing hero/principles/journey bodies trimmed ~35–45% in en/fr/de; hub accents/evidence/boundaries tightened (boundary truthfulness kept, never weakened); SEO meta titles/descriptions untouched | done — live-verified |
| N | Chat working-state polish: `ThinkingOrbs` (aicss/orbs-inspired discrete activity dots) replaces the generic spinner in the assistant responding state; tokenized CSS, dual reduced-motion channels | done — anim verified live |

**Round-2 discoveries**

- `dev.mjs` builds the module graph **once at startup** into `dist-dev/` — it does
  not watch app source. Source edits require a preview restart before they are
  served; browser checks after edits must always follow a restart (a stale
  build once passed a "verification" because old hexes and oklch compute to
  identical colors — caught by string-level checks, not color checks).
- canvasui.dev's html-in-canvas WebGL is an experimental Chrome origin-trial
  API; per the no-dependency law the canvas-2D OrbsField remains the equivalent
  original (and degrades to nothing, same as their fallback path).

## Round 3 — make-interfaces-feel-better skill review (2026-09-03)

Skill installed at `skills/` (MIT, jakubkrehel/make-interfaces-feel-better — npx CLI
hangs without a TTY in this sandbox; fetched the complete skill directory from
GitHub per its own README instructions for non-Claude agents).

Full-mode review findings, all fixed in the project's system (plain CSS + tokens):

| Severity | Location | Change |
|---|---|---|
| MEDIUM | `index.css` icon-button recipe (md 32px default) | Added a 40×40 `::after` hit halo (dense-desktop floor) without changing visible geometry; `--sm` exempt (inline chat stacks sit closer than the halo — collision rule) |
| MEDIUM | aw layer body copy | `text-wrap: pretty` on landing description, principle/journey bodies, hub accent + proof-card copy (headings already `balance`) |
| LOW | `index.css` `.button:active`, `body .icon-button:active`, layered `button:active` | Press scale normalized 0.97/0.97/0.98 → 0.96 (skill's exact value) |

Rejected candidates (documented per the skill's format): raising `--icon-hit-md`
to 40px (breaks the sm/md/lg ladder contract + recipe test; halo achieves the
goal); image outlines on art slabs (all images are screen-blend art inside
bordered plates — a neutral outline reads as noise there); concentric-radius
changes on principle cards (24px padding ≥ the skill's separate-surfaces
threshold; governed 4/6/8/10 scale is the system); `.nav-item:active` 0.985 →
0.96 (full-width rail surface; 0.96 on a 248px control reads dramatic).

Already-conformant (no change needed): no `transition: all` anywhere; root
`-webkit-font-smoothing: antialiased`; `--tabular` token applied to dynamic
numbers (mono faces are fixed-width anyway); `text-wrap: balance` on all h1s;
`will-change` only on transform/opacity lanes; enter stagger ~120ms on
infrequent entrances only; interactive state changes use transitions
(interruptible), keyframes reserved for one-shot staged sequences; every
animated hover also carries a static color/border cue; icons are one
`currentColor`/strokeWidth-2 set.

### Round-3 verify log

| Time (UTC) | Check | Result | Evidence |
|---|---|---|---|
| 22:2x | Gates after fixes: 156/156 tests (incl. iconButton recipe + both contrast gates), lint 0 errors | pass | shell output |
| 22:2x | Fresh build live: `text-wrap: pretty` computed on landing description + principle body; all three `:active` scales read `scale(0.96)` from served CSS | pass | DOM eval |
| 22:2x | Icon-button halo: visible 32×32, `::after` 40×40 absolute hit halo, `position: relative` base | pass | DOM eval |
| 22:2x | State walk on /transactions: active nav item carries static cues (copper 10% wash + 2px inset rail) alongside any motion; 0 console errors | pass | DOM eval |

Not verified: 10%-speed visual motion replay (this model route cannot inspect
pixels; motion was verified structurally — transition/animation properties,
durations, easings, and static cues — not visually).

## Round 4 — jakubkrehel/skills collection, better-interface review (2026-09-03)

Installed the full 16-skill collection (MIT) under `skills/<name>/` (npx CLI
prints its banner then waits on a TTY here; fetched from GitHub per the
README's non-Claude instructions). Ran the `better-interface` orchestration:
accessibility → layout → writing → typography → colors → UI.

| Severity | Domain | Location | Change |
|---|---|---|---|
| MEDIUM | colors | `axiom-awwwards.css`, `axiom-seo-public.css` (34 refs) | Primitive tokens applied directly in component rules → semantic tier: `--aw-copper`→`--aw-accent`, `--aw-copper-bright`→`--aw-accent-strong`, hero live-dot → `--aw-ok`, `--aw-paper-100/300`→`--aw-text`/new `--aw-text-dim`. Brand-triad gradient refs keep the primitives (brand usage, not state). Pixel-faithful: verified identical computed colors live. |
| MEDIUM | layout | `index.css` (~35 physical props) | RTL-correct logical swaps, all LTR-identical: `text-align: left`→`start` (16), `margin-left: auto`→`margin-inline-start` (11), accent-bar `border-left`→`border-inline-start`, receipt/mobile drawer anchoring + separators + chat list indent → logical |
| MEDIUM | ui | `AppShell.tsx` + aw css | Theme flips smeared every color transition at once → one-frame `theme-switching` transition freeze (better-ui suppress recipe) |

No escalation triggers fired (names/focus/keyboard/reduced-motion/320px/contrast/color-alone all verified clean — see verify log).

Rejected: copper ramp hue drift 55→65.8° (shipped brand hexes; reporting per
skill, not repainting), gradient interpolation space (established verified
look), image outlines on screen-blend art slabs, raising `--icon-hit-md`.

### Round-4 verify log

| Time (UTC) | Check | Result | Evidence |
|---|---|---|---|
| 22:4x | 320px reflow (headless CDP): landing + /agents — no horizontal overflow, h1 clamps to 40px/33.6px | pass | `after-23/24-*-320.png` |
| 22:4x | Accessible names: 0 unnamed of 18 interactive elements on landing; landmarks main/nav/footer present; exactly 1 h1 | pass | DOM eval |
| 22:4x | Keyboard walk: tab stops land on nav links with visible 2px solid `:focus-visible` ring | pass | DOM eval |
| 22:5x | Gates after fixes: typecheck 0, 156/156 tests, lint 0 errors (4 pre-existing warnings) | pass | shell output |
| 22:5x | Fresh build: semantic-token swap pixel-faithful (`.p-icon` = exact copper-bright oklch, live dot = exact phosphor oklch); `text-align: start` rules served; console renders with chrome + active rail; 0 console errors on / and /transactions | pass | DOM eval |

Not verified: 10%-speed visual motion replay and screen-reader announcements
(no pixel/audio inspection on this route; verified structurally + via
accessible-name/landmark/focus DOM checks).

## Round 5 — better-ui execution (2026-09-03)

Direct execution of the pasted `better-ui` skill against the project (most rules
already conformant from rounds 3–4; this pass closed the remaining gaps):

| Severity | Location | Before → After |
|---|---|---|
| MEDIUM | `index.css` — `.text-link`, `.axiom-field`, `.prompt-card`, `.chat-history__item`, `.agent-row`, `.field-control` | Property-less transition shorthands (`transition: var(--dur-fast) var(--ease)` = ALL properties) → exact property lists matching each rule's actual state changes (color / border-color / background-color / box-shadow) |

No applicable sites (documented): optical icon-side padding (no padded
icon+label buttons exist — gap-based or icon-only), contextual icon
cross-fade (no icon-component swaps; CopyButton's single-node label swap
is the documented a11y-correct choice — one announcement, no layout shift
via `min-width: 4ch`), `AnimatePresence initial={false}` (no motion
library in the project), image outlines (screen-blend art slabs — rejected
in rounds 3–4).

Verified: 156/156 tests, lint 0 errors; fresh build serves
`transition: color var(--dur-fast) var(--ease)` on `.text-link`; 0 console
errors. Not verified: 10%-speed visual motion replay (no pixel inspection
on this route).

## Round 6 — better-layout execution (2026-09-04)

Direct execution of the pasted `better-layout` skill (with its
grouping-and-alignment and spacing-and-adaptivity references) against the
project. Group-gap ratios, fold-peek cues, fixed-width audit, order-by-
importance and breakpoints were already conformant from rounds 1–5.

| Severity | Location | Before → After |
|---|---|---|
| MEDIUM | `index.css` `.rail-controls` | 4px gap between the 32px rail toggle/hide buttons — their 40px hit halos overlapped by 4px (mis-tap zone) → 12px gap, 4px halo clearance |
| MEDIUM | `index.css` `.sidebar.is-collapsed` | Collapsed 72px rail: brand collapses to 0 and the 68px two-button cluster overflowed the rail by 18px → hide-toggle removed in collapsed state, remaining toggle centered (x20–52), halo inside the rail |
| MEDIUM | `index.css` `.landing-menu-trigger` | Wave-5 intent was a 40px hamburger but `body .icon-button` (0,1,1) overrode the (0,1,0) min-width → rendered 32px with its halo spilling 5px into scrollWidth → `body .icon-button.landing-menu-trigger` (0,2,1) with width/height 40px |
| LOW | `index.css` `.topbar-actions` | 8px gap → 12px (halo-touching clusters are the same root cause as the rail gap) |
| LOW | `index.css` `.connect-modal-close`, `.landing-mobile-menu`, `.sidebar.is-collapsed .side-head` | Physical `right` / `padding-left`/`padding-right` leftovers from the round-4 logical-properties pass → `inset-inline-end` / `padding-inline` |

New tooling: `.design-audit/locale-growth.ts` — headless-Chrome harness that
injects the REAL German copy (from `lib/copy.ts`) into the live DOM and
measures clipping. Result at 390px and 1440px: 55 text nodes swapped, no
document overflow, no text clipping outside the intentional marquee ticker
bleed — the translated-growth stress test passes with real locale strings
(fr is structurally identical; `direction: rtl` is console-gated and was
mirror-verified in round 4).

Not verified: German rendering of wallet-gated console surfaces (the locale
switch lives behind the wallet gate in this sandbox); 200% browser zoom.

## Round 7 — better-interface consolidated review (2026-09-04, read-only)

Full six-domain orchestrated review in the consolidated format (accessibility →
layout → writing → typography → colors → UI) against the current build
(`fd807c5`). One LOW finding; no HIGH/MEDIUM. No source changes (review-only
per the skill's rule 10).

| Severity | Domain | Location | Before → After (proposed) |
|---|---|---|---|
| LOW | UI | `index.css:98` `.sidebar.is-collapsed .brand span` | Hides ALL spans in `.brand` including `.axiom-brand-mark` itself → the logo vanishes entirely from the collapsed rail (brandW 0, measured round 6). Proposed: `span:not(.axiom-brand-mark)` so the copper mark stays as the rail's identity anchor |

Verification evidence: unnamed-interactive scan 0 across /, /transactions,
/chat, /agents, /settings, /transfer, /proofs; chat-thread delete carries an
undo toast (ChatPage.tsx:1513); reduced-motion probe clean (revealStuck 0,
1440px); 320px reflow no overflow; reveal-pending vs stuck disambiguated by
full-scroll (all 5 activate); contrast pairs test-locked (156/156); no vague
disclosure labels; error paths carry recovery CTAs; tabular-nums tokens in
place. Not verified: gated-console German rendering, 200% zoom, screen-reader
audio, pixel inspection (route limitation).



## Round 8 — better-accessibility execution (2026-09-04)

Exhaustive execution of the pasted `better-accessibility` skill with all six
references (forms, focus-and-keyboard, hit-areas, motion-and-zoom,
screen-readers, semantics-and-aria). The audit walked every reference rule;
most of the codebase already conforms deeply (shared `useModalDismiss`
contract: Esc + Tab trap + initial focus + restore on every dialog; Field
component: label htmlFor + aria-invalid + aria-describedby + inputMode;
dual reduced-motion channels; hover-paused ticker; 24px hit floor + 40px
halos; no positive tabindex; no `div onClick` outside the documented backdrop
leg; focus-visible rings throughout; FX layers pointer-events:none).

| Severity | Location | Before → After |
|---|---|---|
| HIGH | `ChatPage.tsx` delete toast | Only undo path auto-dismissed at the Toaster's 3s default (data loss on a schedule) → `duration: Infinity` |
| MEDIUM | `FlowPage.tsx` openReview | Submit errors announced but focus stayed on the trigger → focus moves to the first invalid control (rAF + `[aria-invalid=true], .field-error *`); agent select gains `aria-invalid` |
| MEDIUM | `Controls.tsx` field-message | `role="alert"` (assertive) on field-tied errors → `role="status"` (polite; describedby + focus-first-invalid carry the announcement) |
| MEDIUM | `App.tsx` | SPA route changes moved no focus → focus `<main>` (tabindex -1, preventScroll) on every route change, both shells; `main` elements get static `tabIndex={-1}` for skip-link focus landing |
| MEDIUM | `LandingPage.tsx` | No skip-to-content on the public landing (console had U27) → skip link added as first focusable, target `#hero`; `.skip-link` CSS `left` → `inset-inline-start` (round-4 leftover) |
| LOW | `main.tsx` Toaster / `App.tsx` notice | Timed toasts at 3s/4s, under the 5s floor, no hover-pause → 5000ms + notice timer pauses on hover/focus (mouse and focus capture) |
| LOW | `index.css` | No `touch-action: manipulation` / `-webkit-tap-highlight-color` → both on all interactive surfaces |

Verified live: skip link is first tab stop, hidden at -60px, visible at 8px on
focus, Enter lands focus on `main#hero`; SPA nav (Transactions → Overview)
lands focus on the new view's main; `touch-action: manipulation` +
`tap-highlight: transparent` computed on `.j-cta`; 156/156 tests, typecheck 0,
lint 0 errors; 0 console errors. Not verified: wallet-gated form submit focus
flow and undo-toast persistence in the running app (gate unreachable in this
sandbox — code-verified); screen-reader audio; 200% zoom (320px reflow is the
stricter equivalent and passes).

## Round 9 — full-sweep audit: writing, typography, colors (2026-09-04)

Fresh cross-domain audit at `a45809d` (the pasted accessibility set was already
executed in Round 8; this pass ran the three domains never exercised
standalone — better-writing, better-typography, better-colors — plus
re-verification of the Round-8 fixes on a fresh build). The codebase is deeply
conformant after rounds 3–8; four real findings, all fixed:

| Severity | Domain | Location | Before → After |
|---|---|---|---|
| MEDIUM | colors | `index.css:4024` `.journey-card p` | `--muted` on the card gradient measured **4.46:1** (AA needs 4.5) → `color-mix(in srgb, var(--muted) 86%, white)` → measured **5.22:1** |
| MEDIUM | typography | `index.html` font links | JetBrains Mono **700 used** (`.state-pill`, storage-step dash) but only 400/500/600 loaded → synthesized bold → 700 added to both link URLs; `document.fonts.check('700 16px JetBrains Mono')` → true |
| LOW | writing | `copy.ts` errorBoundary ×3 locales | "Something went wrong" / "Une erreur est survenue" / "Etwas ist schiefgelaufen" (vague, the skill's anti-pattern) → "Unable to load this view" / "Impossible de charger cette vue" / "Ansicht konnte nicht geladen werden" |
| LOW | typography | `.scroll-section h2` | No `text-wrap: balance` on section headings → balance added (computed `balance` verified) |
| LOW | layout | `.sidebar.is-collapsed .brand span` (Round-7 leftover) | Selector hid the brand mark itself, and the mark+toggle pair cannot fit side-by-side in the collapsed rail's ~36px content → mark excluded from the hide rule + `side-head` becomes a centered grid stack in collapsed mode (mark above toggle). Verified: mark 30px at rail center, toggle directly below, no overlap, expanded state unchanged |

Passed on inspection (notable): all other landing pairs 5.2–18.1:1 (proper
oklch→sRGB live measurement — an earlier naive pass produced invalid numbers
by parsing oklch strings as sRGB, caught and redone); console light theme
4.9–15.2:1; inputs at 16px; root font smoothing; smart punctuation (curly
quotes, en dashes, no literal "..."); no bare "Learn more"; errors carry
remedies; empty states point forward; verb-first buttons; text-wrap pretty on
descriptions + balance on display h1s; tabular-nums via mono faces; Fraunces
self-hosted woff2.

Re-verified Round-8 fixes intact on fresh build: skip link first tab stop,
main tabindex −1, route focus (chat lands on its sidebar-toggle — ChatPage's
own pre-existing view-local focus contract), 0 console errors.

Incident note: the dev server exited overnight on its own (second occurrence);
recovered via preview_start before verification.

## Round 10 — full-depth scroll audit: every section, both themes (2026-09-04)

User-flagged gap: prior contrast sweeps sampled top-section selectors only. This
round scrolled the full page height in steps (all reveal animations confirmed
firing; 0 elements left invisible) and walked **every direct-text element** on
each surface with a corrected evaluator (oklch decimal-form parse, alpha
compositing for semi-transparent text AND background chains, gradient-clip
text excluded as painted by the gated accent ramp). Two harness bugs were found
and fixed mid-round; one earlier "fix" was reverted on the corrected evidence.

| Severity | Location | Before → After (measured live) |
|---|---|---|
| HIGH | `.journey-card .j-meta` (index.css:4026) | `--dim` #858e8d on the journey grid surface = **3.54:1** at 13px (dim was certified 4.6:1 on console panel-2, not this lighter surface) → `color-mix(in srgb, var(--dim) 78%, white)` → full-page walk **0 fails** |
| HIGH | `.app-shell.light` token block | `--ink`/`--ink-bright` never overridden — 24 direct `var(--ink)` usages rendered **cream on paper** in light theme (skip-link measured **1.2:1**) → added `--ink: #202528; --ink-bright: #1a1610` → skip-link now dark-on-white, all pages pass |
| LOW | `--aw-text-soft` (axiom-awwwards.css:43) | Temporarily raised 72%→88% on a false reading; corrected evaluator shows 72% composited = **9.18:1** → **reverted to the design's 72%** |

Pages walked to zero failures (light, default under headless
`prefers-color-scheme: light`): `/`, `/agents`, `/payments`, `/proofs`,
`/storage`, `/app`, `/chat`, `/transactions`, `/mint`, `/settings`; plus
`/storage` dark-forced (ink override scoped to `.app-shell.light`, dark
untouched).

Artifacts documented (not defects): gradient-clipped display `<i>`/`<span>`
(`color: transparent`, glyphs painted by the AA-gated accent ramp); skip-link
measured unfocused (off-canvas until `:focus`).

## Round 11 — landing layout, interactivity, wallet friction (2026-09-04)

User-reported: right-side hero space dead, ticker width, repetition, side space
wasted, modal connect friction, cards overlaid by text. Measured with
`.design-audit/landing-space-audit.mjs` (per-width: section widths, ticker,
hero split, overlap detection) at 390/768/1024/1440/1920.

| Issue | Before (measured) | After (measured) |
|---|---|---|
| Hero visual plate collapsed on desktop — `block-size: min(100%, 420px)` resolved against a content-free grid item (poster `display:none`) → plate = its 2px borders; receipt/caption floated over nothing ("cards overlayed by text") | visual h **2px** at 768/1024/1440/1920 | **420–640px** at every width (aspect-ratio 5/6, floors/caps); poster renders; 0 spills/overlaps |
| Dead side space (max-width 1180 container) | **18.1%** at 1440, **38.5%** at 1920 | **0%** at 1440, **18.8%** at 1920 (1560 cap keeps line lengths sane); ticker now full-bleed (w = viewport at all widths) |
| Hero right side not interactive | pointer-inert art slab | `aw-spotlight` pointer-tracked glow (existing FX contract), whole plate is one `/proofs` link (`proof-plate-link`, focus ring, a11y label ×3 locales), receipt card lifts on hover (reduced-motion safe) |
| Wallet connect friction (gate → chooser modal → WalletConnect) | mobile CTA opened the chooser | mobile CTA connects the walletConnect connector **directly**; chooser remains only for the >1 injected-wallet conflict |
| Copy repetition / cognitive load | "receipt" ×7 on one page; "non-custodial" ×2; 3-clause journey bodies | deduped + condensed across EN/FR/DE (description, journey bodies, principles[2]); "receipt" now ~4, no verbatim repeats |

Verification: space audit re-run clean (0 overflow, 0 spills at all 5 widths);
plate click → `/proofs` live; spotlight + link + hover computed styles
verified; 0 console errors; 156/156 tests; typecheck 0; lint 0 errors.
Not verifiable in this sandbox: the WalletConnect QR handshake itself (no
wallet) — source-verified only.

## Round 12 — full-viewport overhaul, Three.js, one-action wallet, global theme (2026-09-04)

User order: eliminate side margins/dead zones, hide horizontal scrollbars,
ticket consistency, direct WalletConnect (no extra modals, delete dead modal
code), Three.js background, micro-interactions, missing scroll sections,
global light/dark toggle, ~50% shorter sentences, live/static separation.
Hard-rule exception: rule 6 (no new npm deps) — Three.js was explicitly
ordered; installed `three@0.185.1` + `@types/three` (dev).

| Area | Before (measured) | After (measured) |
|---|---|---|
| Dead side space | 1560 cap: **18.8%** @1920 (38.5% pre-R11) | **0%** on every section at 390/768/1024/1440/1920 (`.design-audit/landing-space-audit.mjs`) — containers fully fluid, clamp padding is the only reserved edge |
| Horizontal scrollbar | none detected | none at any width + `overflow-x: clip` guard on `.landing-page` (fixed elements can never grow scrollWidth) |
| Ticker (tickets) | 1 item beside label @390 | compacted ≤480 (11px mono, tighter gaps): label on + 1 full item cycling @390 (marquee rotates all 6), 2 @768, 3 @1024, 4 @1440, 6 @1920; item hover lift |
| Missing scroll section | "How it works" nav anchor mis-landed on `#journey` | new `#how` section — 3 steps (Mint/Fund/Run), reuses principles card system (no numbered chips — rule 1); anchor points correctly; EN/FR/DE copy |
| Wallet flow | gate modal → nested `ConnectModal` chooser → WalletConnect | ONE panel total: 1 injected → auto-connect in the click gesture; >1 → inline option list inside the gate; 0 → WalletConnect starts directly, pairing URI captured from the connector `message` event and shown inline with a copy button. `ConnectModal.tsx` + `.connect-modal*` CSS + layer-list entry deleted |
| Three.js background | OrbsField (2D canvas) | `ThreeBackground` — 1400-point copper/phosphor field, additive blending, DPR ≤1.75, single draw call, rAF paused on hidden tab, reduced-motion = static frame, full disposal; replaced OrbsField on landing only (hubs keep it); **no-WebGL guard** (headless browsers must never lose the landing — found live when the error boundary swallowed the page) |
| Global theme toggle | landing dark-locked (ledger L3-B9); light tokens existed only inside `.app-shell` | `ThemeToggle` icon button on landing nav + console topbar; uiStore-persisted; new `body.light` token block covers everything outside `.app-shell` (landing + body-ported chrome). Key discovery: the landing's completion aliases are **`:root`-scoped var() chains** — remapping base tokens at `body.light` never reaches them; the aliases must be overridden explicitly. Tokenized the 3 remaining hardcoded dark glass cards (proof-label, hero-caption, floating-receipt → `color-mix(var(--panel))`) |
| Theme contrast (light) | landing light = 16 failing pairs (1.25:1 mass failures — dark canvas behind flipped ink) | alpha-aware, oklch-decimal-aware full-page walk: **0 real fails** (one conservative artifact: `.j-cta` measured against the grid hairline 4.28:1; its real gradient bg composites to 4.74:1). R10's `color-mix(..., white)` lifts were wrong-direction in light → `var(--ink)` lifts (theme-aware) |
| Dark regression | — | full-page walk: **0 fails** |
| Copy length | principles bodies 2 clauses | trimmed further (×6 strings EN/FR/DE); "An on-chain vault with a daily limit. No off-chain guardrails." etc. |
| Micro-interactions | static cards | journey-card brightness lift (no translate — the 1px hairline grid would gap), ticker item color lift, pointer parallax on the three.js camera (reduced-motion off) |

Verification: live at 390/768/1024/1440/1920 (space audit: 0% dead, 0
overflow, 0 overlaps); light + dark full-page contrast walks clean; theme
toggle verified end-to-end live (click → flip → persist → survive reload);
wallet gate verified single-dialog (1 `role=dialog`, 0 `.connect-modal-layer`,
no nested modal); 156/156 tests (10,603 expects), typecheck 0, lint 0
errors. Not verifiable in this sandbox: the three.js canvas pixels (managed
browser has WebGL disabled entirely — the no-WebGL fallback path is what
verified; real browsers with GPU get the field), the WalletConnect pairing
handshake (no wallet; URI capture is source-verified, requires a real
`VITE_WALLETCONNECT_PROJECT_ID`), and pixel-level appearance (DOM/computed-
style/JS-eval evidence only).

## Round-2 verify log

| Time (UTC) | Check | Result | Evidence |
|---|---|---|---|
| 22:05 | Fresh build (preview restarted): landing hero gradient serves `oklch(...)` tokens; terse description + all 3 principle bodies live; 0 kickers; 0 console errors | pass | DOM eval, `after-21-landing-oklch.png` |
| 22:05 | `/agents` hub: terse accent ("See what an agent is, what it did, and what backs it."), 0 artifact blocks, 0 console errors | pass | DOM eval |
| 22:06 | `/chat`: renders, 0 console errors; probe element picks up `aw-orb-pulse` animation (ThinkingOrbs CSS live) | pass | DOM eval, `after-22-chat-oklch.png` |
| 22:0x | Gates: typecheck exit 0; `bun run test` 156/156 (incl. new aw-contrast gate); lint 0 errors / 4 pre-existing warnings in untouched guard tests | pass | shell output |

## Verify log

| Time (UTC) | Check | Result | Evidence |
|---|---|---|---|
| 2026-09-03 pre-rebuild | `/`, `/agents`, `/payments`, `/proofs`, `/storage/0g`, `/developers`, 404, `/app` gate render, 0 console errors (original design — captured as `before` shots) | pass | `.design-audit/awwwards-shots/*-desktop.png` |
| 2026-09-03 pre-rebuild | `/transfer/co-sign` crashes: missing `VITE_STRATEGY_VAULT_ADDRESS` env (ErrorBoundary shown) | fail → Stage F | snapshot in thread |
| 2026-09-03 20:4x | Rebuilt `/`: FX layer mounted (orbs canvas ×1, grain ×1, scroll-progress ×1, marquee with aria-hidden duplicate track), 0 kicker elements, 0 console errors | pass | `after-01/02-landing-*.png`, DOM eval |
| 2026-09-03 20:4x | Rebuilt hubs `/agents` `/payments` `/proofs` `/storage/0g` `/developers`: correct SEO titles, FX mounted (canvas+grain+reveal), 0 kickers, 0 console errors each | pass | `after-03..07-*.png`, DOM eval |
| 2026-09-03 20:4x | `/transfer/co-sign` renders empty-state ("Nothing to accept yet") — ErrorBoundary crash gone, 0 console errors | pass | `after-08-cosign.png` |
| 2026-09-03 20:45 | `/app` wallet gate renders preview state ("WALLET NOT CONNECTED" functional status, preview panels), 0 console errors | pass | `after-09-app-gate.png` |
| 2026-09-03 20:45 | 404 renders route copy + hub links, 0 kickers, 0 console errors | pass | `after-10-notfound.png` |
| 2026-09-03 20:5x | `bun run --filter @axiom/frontend typecheck` exit 0; `test` 150/150 pass (10417 expect) | pass | shell output |
| 2026-09-03 21:0x | Console routes verified (preview/gate state): /app /transactions /chat /settings /storage /mint /payment /tick /deposit /withdraw /agents/7 — 0 kickers, 0 errors, no ErrorBoundary; AW chrome confirmed live via computed styles (topbar copper inset hairline, `.button-primary::after` metal sweep, `--aw-ink` resolves) | pass | `after-09..15-*.png`, DOM eval |
| 2026-09-03 21:1x | Responsive (headless Chrome + CDP device-metrics override — daemon viewport emulation doesn't apply in this session): landing 390 / 834 / 1440 — no horizontal overflow at any width, h1 clamps 44.9 → 58.4 → 89.6px; /agents /app /transfer/co-sign at 390 — no overflow, 0 kickers | pass | `after-16..20-*.png` |
| 2026-09-03 21:1x | Reduced-motion (emulated `prefers-reduced-motion: reduce`): all 5 landing reveals visible immediately (0 stuck), ticker animation `none`, orbs canvas not rendered | pass | DOM eval |
| 2026-09-03 21:1x | RTL spot-check (`dir=rtl` on landing, scrolled): no horizontal overflow, journey cards stay in-viewport, 0 console errors | pass | DOM eval |
| 2026-09-03 21:1x | Light theme: headless captures default to light `data-theme` — mobile/tablet shots above are light-mode renders; no overflow or kicker regressions | pass | `after-16..20-*.png` |
| 2026-09-03 21:2x | Full-repo gates: `bun run typecheck` 4/4 packages exit 0; `bun run test` 563 tests (config 62, chat-runtime 100, backend 251, frontend 150) 0 fail, exit 0; `bun run lint` 0 errors (4 pre-existing unused-import warnings in untouched guard-test files) | pass | shell output |
