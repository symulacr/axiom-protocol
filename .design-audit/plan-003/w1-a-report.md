# W1-A report — landing noise purge (plan 003)

Scope: `apps/frontend/src/pages/LandingPage.tsx`, `apps/frontend/src/hooks/`.
Did not touch `copy.ts` or `styles/index.css` (W1-B's files).

## Removed (old line refs before edit)

1. **Header comment** (lines 1-10): rewritten to describe the calm redesign (v3); deleted L2/AW round narration mentioning ticker, trust, proof, journey.
2. **Ticker machinery** (lines ~119-133, 137-177 JSX ~265-304):
   - `useLandingTicker` call, `seenAgents`/`tickerItems` padding logic
   - `tickerRef`, `viewportRef`, `trackRef`, `tickerCopies` state, `copiesRef`, `reducedMotion` (`useReducedMotion`), the width-measurement effect and the offscreen IntersectionObserver effect
   - the whole `<section ref={tickerRef} className="ticker">…</section>` block and the R16 header comment that paired nav with ticker
3. **Hero meta strip** (~318-338): `<div className="hero-meta">` with network + agents-online items. `agentsCount` was used ONLY here and in journey (both removed), so `useLandingStats` and its `chainId`/`APP_CHAIN` import are gone too.
4. **Trust chips** (~357-370): `<div className="trust-line">` with ShieldCheck/Clock3/FileCheck2. Note: ShieldCheck/FileCheck2 imports were restored because `PrincipleIcon` (kept) dispatches on them; only `Clock3` is dropped.
5. **Proof plate chrome** (~375-457): entire second Reveal'd hero-visual section — proof-plate-link, hero-visual-poster img, proof-corners, proof-label, proof-hairline, hero-caption, floating-receipt (ReceiptSeal), `plateRef` + onPointerMove spotlight handler.
6. **"Try the assistant" text-link button** (~351-356).
7. **Journey section** (~513-545): whole `<section className="scroll-section journey-section" id="journey">` incl. `Parallax` usage and the `journeyOnClicks` map.
8. **CountText helper** (~53-71): only consumers were hero-meta and journey.
9. **Deleted file**: `apps/frontend/src/hooks/useLandingTicker.ts`.

## What remains

Skip-link, nav (Logo/ThemeToggle/Connect/hamburger/mobile menu), hero copy + h1 + button-row (Connect + How it works), principles section, how-section (SignalArcField), footer, Reveal/ScrollProgress/GrainOverlay/SpotlightCard/ThreeBackground, ThemeToggle, Logo, routeRegistry navigation, error copy untouched. Icons still imported: CircleHelp, Globe2, Menu, Wallet, ArrowRight, ShieldCheck, FileCheck2, CreditCard.

## Grep evidence

- `useLandingTicker|TICKER_MAX_ITEMS|useLandingStats` across `apps/frontend/src` (pre-delete): only `useLandingTicker.ts` itself, `useLandingStats.ts` itself, a prose comment in `copy.ts` (not a code import), and `LandingPage.tsx`. No other importer → safe to delete the hook file.
- `useLandingStats.ts` was NOT deleted: its only importer (LandingPage) dropped it, but the task authorized deleting only `useLandingTicker.ts`. It is now dead code — coordinator may want it removed in a later pass (it will not fail tsc).
- Post-edit grep of LandingPage.tsx for `ticker|trust|hero-meta|proof|journey|tryAssistant|agentsCount|CountText|Parallax|ReceiptSeal|APP_CHAIN|plateRef` shows only comments/`PUBLIC_HUB_PATHS.proofs` (a footer link, unrelated to the proof plate).

## tsc result

`cd apps/frontend && bunx tsc --noEmit`:

```text
src/components/axiom/AppShell.tsx(857,32): error TS2339: Property 'nextSafeAction' does not exist on type '{...landing keys...}'
```text

`LandingPage.tsx` itself typechecks clean (0 errors attributable to it). The single remaining error is in `AppShell.tsx` line 857, outside my file scope, reading `copy.landing.nextSafeAction` — a key W1-B is concurrently removing from `copy.ts`. Reported, not fixed, per instructions. LandingPage references none of: `copy.landing.ticker`, `.trust`, `.meta`, `.proof*`, `.journey`, `.tryAssistant`, `.stripOperateSmall`, `.consoleAccess`, `.nextSafeAction`, `.proofCaption*`, `.preview*`.

Not run (per task): lint/build/tests, git add/commit.
