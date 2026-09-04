# 001 — Filters popover origin + touch-gated hover lifts

Stamped at commit `9ce81aa` (2026-09-04). Status: DONE — executed together
with the audit per the owner's standing execute order.

## Finding 1 — `.filters-popover` teleports in

File: `apps/frontend/src/styles/index.css` (the `.filters-popover` block,
after `.filters-popover .filter`).

The popover is trigger-anchored (opens beside the transaction filter button)
but had no entrance motion and no `transform-origin`. Target per
`improve-animations/AUDIT.md` §3: trigger-anchored surfaces scale from their
trigger, `scale(0.9–0.97)` + fade, 125–200ms for small popovers.

Applied exactly:

```css
.filters-popover {
  transform-origin: top right;
  animation: filters-popover-rise 180ms var(--motion-ease) both;
}
@keyframes filters-popover-rise {
  from { opacity: 0; transform: scale(0.97) translateY(4px); }
  to   { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .filters-popover { animation: none; }
}
```

Rationale for keyframes over a transition: the popover toggles occasionally
(not rapidly reversible), so restart-from-zero on re-open is safe per AUDIT.md
§4. `var(--motion-ease)` = `cubic-bezier(0.2, 0.7, 0.2, 1)` (repo token —
extends the existing ladder, invents nothing).

## Finding 2 — un-gated hover TRANSFORM lifts

Same file. `.principle:hover, .journey-card:hover` (inside the
`@media (prefers-reduced-motion: no-preference)` W5-4 block) and
`.connect-options-inline .button:hover` applied `translateY(-1/-2px)` to any
pointer, including touch (false hovers on tap — AUDIT.md §6).

Applied: the transform declarations moved under
`@media (hover: hover) and (pointer: fine)`; the border-color/color tints
remain un-gated so touch users keep the non-motion feedback. The W5-4
transition list is unchanged (it already covers transform for the gated case).

## Verification

- `bun run typecheck` 0, `bun run test` 156/156, `bun run lint` 0 errors.
- Feel-check (in-sandbox, computed-style evidence): popover
  `animation-name: filters-popover-rise` resolves on `/transactions` with the
  popover open; the card-lift transform applies under a fine-pointer
  emulation and not otherwise.
