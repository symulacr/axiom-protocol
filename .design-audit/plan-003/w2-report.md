# Plan 003 — W2 report: ThreeBackground restrained scene + SignalArcField removal

Branch: hoplite/plan-003-landing. Date: 2026-09-07.

## Files changed

- `apps/frontend/src/components/fx/ThreeBackground.tsx` — full scene rewrite, contract preserved.
- `apps/frontend/src/pages/LandingPage.tsx` — removed the SignalArcField import (old line 36) and its JSX usage + comment in the how-section (old lines ~221-223). No other content touched.
- `apps/frontend/src/components/fx/SignalArcField.tsx` — deleted (no remaining importers).

## Operational contract checklist

| Contract item | Status |
| --- | --- |
| No-WebGL silent bail (no throw into error boundary) | kept — `window.WebGLRenderingContext` guard + try/catch around renderer construction + `getContext()` check, all unchanged |
| DPR cap 1.75 | kept — `DPR_CAP = 1.75`, `setPixelRatio(Math.min(devicePixelRatio \|\| 1, DPR_CAP))` unchanged |
| rAF paused on `document.hidden`, resumed on visible | kept — same `visibilitychange` listener and `running` flag logic |
| Reduced motion (data-reduce-motion OR prefers-reduced-motion): single static frame, no loop, no pointer parallax | kept — same `reduce` flag gates `pointermove` listener, loop, and resume |
| Full dispose on unmount | kept — geometry/material/renderer dispose, `domElement.remove()`, removal of pointermove/resize/visibilitychange listeners all present |
| One Points draw call, no lights, no postprocessing | kept — single `THREE.Points`, no light added, no post passes |

## Scene parameters chosen

- `POINT_COUNT`: 900 (from 6000).
- Distribution: wide XZ plane — x and z uniform in [-40, 40], y = -12 ± 2 jitter.
- Fog: `new THREE.Fog(0x111315, 8, 45)` (near-black page surface tone; canvas stays `alpha: true`). `PointsMaterial.fog: true` set explicitly so the fade applies.
- Palette: unchanged — copper `#d28b52` majority, phosphor `#67e8b4` at 18%.
- Material: vertexColors, transparent, depthWrite:false, additive blending retained; opacity 0.5 → 0.4; size 0.09 unchanged.
- Motion: `points.position.x = time * 0.01 + Math.sin(time * 0.1) * 0.5` (slow lateral drift + gentle sway, time step 0.008). Replaced the old `rotation.y += 0.0007` / `rotation.z += 0.0002`. Camera far plane 40 → 60 so the fog far of 45 is inside the frustum.
- Pointer parallax: multipliers 1.6/1.1 → 0.6/0.6 (clamped tighter), easing 0.04 unchanged.

## SignalArcField removal evidence

Grep after edit (`grep -rn "SignalArcField" src/`):

- `src/styles/axiom-awwwards.css:881` — CSS comment only, not an importer, and outside my edit scope (index.css rule analog; left untouched).
- Source file deleted; no `.ts`/`.tsx` references remain.

## Verification

- `bunx tsc --noEmit` after all edits: exit 0, clean (run twice — once after scene rewrite + import/JSX removal, once after file deletion).
- Lint/build/tests and git operations intentionally not run per task scope.
