# Plan 003 — landing redesign: final report

Branch: `hoplite/plan-003-landing` (4 commits ahead of origin/master)
Date: 2026-09-07

## Gates

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `bunx tsc --noEmit` | clean, exit 0 |
| Lint | `bun run lint` | 0 errors, 4 pre-existing warnings (App.tsx `any`, routeRegistry unused var, 2 guard-test unused `expect`) |
| Unit tests | `bun test` | 166 pass / 4 fail / 2 errors of 170. The 2 errors are the pre-existing Playwright `test() called here` loader noise. The 4 failures are `src/hooks/useMintWizard.payload.test.ts` ("buildDefaultPayload is not a function"): that function does not exist in `useMintWizard.ts` and no commit on this branch (`git log origin/master..HEAD` on those files is empty) touched the test or the hook. Pre-existing master breakage, not introduced by plan 003. |
| Guard/contrast | `bun test src/styles/aw-contrast.test.ts src/styles/contrast.test.ts src/styles/iconButton.recipe.test.ts src/hooks/useGasTank.card.test.ts src/hooks/useFaucet.guard.test.ts src/pages/ChatPage.guard.test.ts src/pages/DashboardPage.predicates.guard.test.ts src/pages/DashboardPage.replay.guard.test.ts` | 45 pass / 0 fail |
| Build | `bun run build` | success: tsc clean, 101 files built to dist/ |

## LOC diff vs master

`git diff --stat origin/master`:

```text
 apps/frontend/src/components/axiom/AppShell.tsx    |   2 +-
 apps/frontend/src/components/fx/SignalArcField.tsx | 149 -------
 apps/frontend/src/components/fx/ThreeBackground.tsx |  41 +-
 apps/frontend/src/hooks/useLandingTicker.ts        | 124 ------
 apps/frontend/src/lib/copy.ts                      | 468 ++-------------------
 apps/frontend/src/pages/LandingPage.tsx            | 375 ++---------------
 apps/frontend/src/styles/index.css                 | 366 +---------------
 7 files changed, 97 insertions(+), 1428 deletions(-)
```text

Net: −1331 lines.

## Removals ledger (from wave reports)

- W1-a (noise purge, −1217 across waves): landing ticker band, hero meta row, trust chips, proof plate, journey section removed (see w1-a-report.md, w1-b-report.md).
- W2: 6000-point Three.js dome replaced by a restrained 900-point fog plane; `SignalArcField.tsx` (−149) and `useLandingTicker.ts` (−124) deleted entirely (w2-report.md).
- W3: hero copy rewritten to a single-line headline; closing CTA added; principle bodies shortened (w3-report.md).
- W4: icon stroke discipline — consistent 1.5px stroke across all landing icons (w4-report.md).

## After screenshots (1440x900, dist build served statically, Playwright + system Chrome)

- `after-01-full.png` — full page, desktop
- `after-02-hero.png` — hero above the fold
- `after-03-principles.png` — principles section
- `after-04-how-closing.png` — how-it-works + closing CTA
- `after-05-footer.png` — footer
- `after-06-light.png` — light theme, full page
- `after-07-reduced-motion.png` — reduced motion, full page

Baseline shots `before-hero.png` / `before-full.png` are in this same directory.

## Notes

- Screenshot harness: throwaway script in /tmp (not committed), server on 127.0.0.1:4999 serving dist/.
- No .env files touched; work committed only on the branch, never master.
