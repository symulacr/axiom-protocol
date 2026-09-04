# Animation Plans

Audit: `improve-animations` (emilkowalski) skill, executed 2026-09-04 at commit
`9ce81aa`. Effort: standard. Scope: all interactive UI (landing, hubs, console,
chat, modals/drawers/palette).

## Audit result (vetted table)

| # | Severity | Category | Location | Finding | Fix summary |
|---|---|---|---|---|---|
| 1 | MEDIUM-LOW | Physicality & origin / missed opportunity | `apps/frontend/src/styles/index.css` `.filters-popover` | trigger-anchored popover teleported in (no enter motion, no origin) | 180ms rise `scale(0.97) translateY(4px)` → none, `transform-origin: top right`, keyframe enter (occasional toggling — no retarget risk), reduced-motion off |
| 2 | LOW | Accessibility (touch) | `index.css` `.principle:hover, .journey-card:hover`, `.connect-options-inline .button:hover` | hover TRANSFORM lifts un-gated — touch fires false hovers on tap | lifts moved under `@media (hover: hover) and (pointer: fine)`; border/color tints stay for all pointers |

**Explicitly vetted as PASS (no finding):** press feedback (`scale(.96)` at
150ms on `.button`/`.icon-button`:active); no `transition: all`; no bare
`ease-in`; no `scale(0)`; UI durations ≤ 240ms (only marketing entrances at
480–600ms and looping indicators — both exempt); command palette opens with NO
animation (correct for its frequency class); stagger exists on landing copy
(80ms steps); reduced-motion dual-channel (OS + app setting) is comprehensive;
all motion is transform/opacity except the two documented layout-animating
deliberate exceptions (rail width, chat search width — settled, see rule 5).

**Settled decisions respected (skill Hard Rule 5):** the documented motion
ladder (`--motion-rise` overshoot curve on modal enters, `--motion-ease`, the
W5-4 card-lift block) is a deliberate, ledger-documented convention — noted,
not reported.

## Missed opportunities (additive, not filed)

None worth filing: route swaps are correctly instant for a dashboard's
frequency; CountUp already animates value changes; the theme flip uses the
documented one-frame transition freeze.

## Plans

| Plan | Status |
|---|---|
| [001-popover-origin-and-touch-gating.md](001-popover-origin-and-touch-gating.md) | DONE (executed in-commit with the audit) |
