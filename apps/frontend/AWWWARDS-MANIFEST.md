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
