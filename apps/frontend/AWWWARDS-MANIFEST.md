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
| E | Console chrome polish (topbar glass, rail glow, button sweep, panel hairline, page-head type) across app-shell pages | CSS done — visual verify pending (pages carry no kicker markup; audit found `page-head`/`panel-head` structural classes only) |
| F | Dev environment: root `.env` (public VITE_* testnet addresses from `.env.example`) so contract-wired routes render | done — `/transfer/co-sign` no longer crashes |
| G | Responsive pass: desktop / tablet / mobile on landing + hubs; reduced-motion, light-theme, RTL spot-checks | pending |
| H | Final: `bun run test` + `tsc --noEmit` + eslint, manifest summary, commit | frontend gates green; full-repo pass pending |

## Kicker/noise removal checklist (rule 1)

| Location | Noise element | Status |
|---|---|---|
| Landing hero | `.eyebrow` span ("01 · On-chain agent protocol") | removed + DOM-verified (0 matches) |
| Landing principles | `.section-eyebrow` ("02 // Three principles") + `.p-num` chips | removed + DOM-verified |
| Landing journey | `.section-eyebrow` ("03 // Pick one") + `.j-num` ("// Journey A/B") | removed + DOM-verified |
| All hubs | `.seo-evidence-artifact` blocks (LIVE RECORD / TX HASH / … + EXAMPLE DATA badge) | removed + DOM-verified on all 5 hubs |
| Console pages | kicker-style page-head labels | none found (audit: structural classes only) — visual verify pending |
| copy.ts | now-unused `eyebrow` keys (en/fr/de) | removed |

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
