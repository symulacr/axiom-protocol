# W1-B report — copy.ts + index.css cleanup (plan 003, branch hoplite/plan-003-landing)

Scope honored: only `apps/frontend/src/lib/copy.ts` and `apps/frontend/src/styles/index.css` touched. No gates run, no commits, per instructions.

## 1. copy.ts — keys removed

Removed from the `Copy["landing"]` type interface (~line 115) AND from all three locale bodies (en ~1015, fr ~2003, de ~2988 after edit):

- `nextSafeAction`, `consoleAccess` (scalars)
- `tryAssistant`, `stripOperateSmall` (scalars)
- `proofCaptionSmall`, `proofPlateA11y`, `proofCaptionBody` (scalars)
- `previewAgentDesc`, `previewReceiptTitle` (scalars — no consumer found anywhere in src/)
- `meta` (whole object)
- `trust` (whole object)
- `proof` (whole object, including `proof.label`, `proof.caption` and `proof.receipt.*` — grep confirmed the proof plate / floating receipt in LandingPage.tsx was the only consumer)
- `ticker` (whole object incl. `items` + `actionLabels` + `label`)
- `journey` (whole object)

Kept: `titleLead`, `titleEmphasis`, `description`, `menuGuideHint`, `menuDevelopers`, `menuDevelopersHint`, `nav`, `principles`, `how`, `footer`.

Key-set parity evidence (extracted per landing block, identical in all 4 = type + en + fr + de):

```text
["titleLead","titleEmphasis","description","menuGuideHint","menuDevelopers",
 "menuDevelopersHint","nav","principles","how","footer"]
```text

Before → after landing key counts per locale: 37 → 10 (en), 37 → 10 (fr), 37 → 10 (de). Match confirmed by the node key-set dump above (line 115 / 1002 / 2003 / 2988 in final file). Residual grep for all removed key names in copy.ts: 0 hits.

## 2. index.css — rule blocks removed (310 lines + comment cleanup)

Removed entirely:

- `.hero-meta` + `.meta-item`/`.dot` rules (was 4010–4013) and their header comment
- `.trust-line` + `.trust-item` rules (was 4016–4018)
- `.proof-corners` (4 rules), `.proof-label`, `.proof-hairline`, `.live-pulse` + `@keyframes live-pulse` + its reduced-motion override
- `.proof-plate-link` / `:focus-visible` (removed plate's click target — not explicitly listed, removed as dead)
- `.floating-receipt` base, hover-lift, reduced-motion, static-mobile, and all `.receipt-head/-state/-title/-rows/-meta` rules
- `.ticker` block: `.ticker`, `.ticker-label`, `.ticker-viewport` (incl. 1024px mask media), `.ticker-track`, `.ticker-set`, `.ticker-item` (+hover, dots), `.ticker[data-offscreen]` pause rules, 480px and reduced-motion medias
- `.journey-section`, `.journey`, `.journey-card` (incl. h3/p/hover/micro-interaction), `.j-meta`, `.j-cta` (+hover/svg), 900px media
- `.landing-visual.hero-visual-modern`: base gradient block (~287–295), `> img { display:none }`, `isolation` line (~343), `.hero-visual-modern>img` legacy opacity rule (~91), sizing/aspect block (~968), entrance animation line + `@keyframes landing-fade`, full "modern hero artifact" block with `::before`/`::after` + `.hero-visual-poster` + `.hero-caption` (~1499–1547), 700px media overrides, poster object-position rules, light-mode `.receipt-meta .hash` override, `.landing-page .landing-visual.hero-visual-modern` poster-swap blocks (~3889–3913) and mobile flex-column media rule, L2-RESPONSIVE receipt/caption overlap block (all 4 rules + medias)
- Grouped-rule partial removals: `.j-cta` out of the tap-highlight group (rewritten, declarations preserved), `.journey-card`/`.journey-card:hover` out of the W5-4 micro-interaction medias (`.principle` kept), `.landing-page .journey-card .j-cta` out of the 32px hit-target group (`.p-link` + footer links kept), tabular-nums rule dropped (all 5 selectors were dead)

`.aw-spotlight` hero-specific overrides: NOT FOUND — zero `spotlight` matches in index.css (already gone).

Stale comment cleanup: removed orphaned `L2-N2/N4/N5/N7` headers, ticker/journey spacing narrative, L2-RESPONSIVE banner, Wave-5 receipt/caption plate narrative; updated L2 round banner and `.landing-page` comments that described removed sections. Verified: braces balanced (1488/1488) and comment scan balanced.

## 3. skip-link restyle diff

```diff
-.skip-link { position: fixed; top: 0; inset-inline-start: var(--space-4); z-index: calc(var(--layer-topbar) + 1); padding: var(--space-2) var(--space-4); background: var(--completion-panel); color: var(--ink); border: 1px solid var(--completion-copper); font: 500 var(--fs-small) 'JetBrains Mono', monospace; transform: translateY(-140%); transition: transform var(--dur-fast) var(--ease); }
+.skip-link { position: absolute; top: 0; inset-inline-start: var(--space-4); z-index: calc(var(--layer-topbar) + 1); padding: var(--space-2) var(--space-4); background: var(--completion-panel); color: var(--ink); border: 1px solid var(--completion-copper); font: 500 var(--fs-small) 'JetBrains Mono', monospace; transform: translateY(-200%); transition: transform var(--dur-fast) var(--ease); }
 .skip-link:focus { transform: translateY(0); }
```text

No rule makes it flash on load: translateY(-200%) holds it off-viewport until `:focus`; the only entrance is the compositor-friendly transform transition. (translateY(-200%) instead of -140% because at -140% the 44px-tall link's bottom edge with padding could still clip into view at very small font scale; -200% clears it fully.)

## 4. Not found (already gone)

- `.aw-spotlight` — no matches in index.css.
- `useLandingTicker.ts` hook — already deleted by W1-A during this window (good; it consumed `landing.ticker`).

## 5. Out-of-scope finding for the coordinator

- `src/components/axiom/AppShell.tsx:857` still reads `copy.landing.nextSafeAction`. With the key deleted, tsc will fail until that line is updated (AppShell is outside W1-B's file scope). Someone must own that edit before gates run.
- `LandingPage.tsx` still had 18 `landing.` references at check time — W1-A's edit was in flight; its completion is the guard.
