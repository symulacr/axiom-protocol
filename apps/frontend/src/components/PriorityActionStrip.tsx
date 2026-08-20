/*
  PriorityActionStrip (ported from the v2 mockup; lucide → local icon shim).
  The "next safe action" lane under the topbar — prefilled, never submitted.
*/
import { useState } from "react";
import { ArrowRight, ChevronDown, ShieldCheck } from "./axiom/icons.js";
import type { AppState, Route } from "../lib/models.js";
import {
  getNextSafeActions,
  getRouteAction,
  type FundTarget,
} from "../lib/nextSafeAction.js";
import { isOperationPath } from "../lib/routeRegistry.js";
import { getCopy } from "../lib/copy.js";
import { trackUxEvent } from "../lib/uxTelemetry.js";

export function PriorityActionStrip({
  state,
  route,
  path,
  go,
  fundTarget,
}: {
  state: AppState;
  route: Route;
  path: string;
  go: (path: string) => void;
  fundTarget?: FundTarget;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const copy = getCopy(state.settings.locale);
  const strip = copy.strip;
  const action = getRouteAction(state, path, fundTarget, strip);

  // Chat fills the viewport below the topbar (live SSE surface) — no strip.
  // Flow pages own a copper primary for their own operation ("Review
  // operation"); the strip's payment CTA must not compete with it, so the
  // strip stays off every operation path (C-SETTINGS / 04 FINDING-004).
  if (
    !action ||
    ["settings", "staking", "chat"].includes(route) ||
    isOperationPath(path.split("?", 1)[0] ?? "")
  )
    return null;

  const actions = getNextSafeActions(state, fundTarget, strip);
  const alternatives = actions
    .filter((item) => item.id !== action.id)
    .slice(0, 2);

  const openAction = (target = action) => {
    trackUxEvent(`open:${target.id}`, route);
    go(target.path);
  };

  return (
    <section
      className={`priority-action-strip priority-${action.priority}`}
      aria-label="Next safe action"
    >
      <div className="priority-rail" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="priority-action-copy">
        <span className="eyebrow copper">{action.eyebrow}</span>
        <strong>{action.title}</strong>
        <p>{action.summary}</p>
      </div>
      <div className="priority-proof">
        <span>{action.proofLabel}</span>
        <b className="mono">{action.proofValue}</b>
        <small>
          <ShieldCheck size={12} /> {action.impact}
        </small>
      </div>
      <div className="priority-actions">
        <button className="button button-primary" onClick={() => openAction()}>
          {strip.openReview} <ArrowRight size={15} />
        </button>
        <button
          className="priority-why"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((open) => !open)}
        >
          {strip.whyNow} <ChevronDown size={14} />
        </button>
      </div>
      {detailsOpen && (
        <div className="priority-details">
          <span className="mono">
            {action.shortcut} · {strip.prefilledNote}
          </span>
          <div>
            {alternatives.map((alternative) => (
              <button
                key={alternative.id}
                onClick={() => openAction(alternative)}
              >
                {alternative.title} <ArrowRight size={13} />
              </button>
            ))}
            <button onClick={() => go("/transactions?filter=review")}>
              {strip.seeAllQueue} <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
