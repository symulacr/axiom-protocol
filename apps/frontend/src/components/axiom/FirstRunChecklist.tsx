/*
  T1 guided first success: a dismissible Dashboard card with 3 steps —
  mint → fund → run. Each step self-checks from state that already exists
  (agents register, vault deposits, tick receipts); no new persistence
  beyond the dismissal boolean in settings. All three done → the card
  collapses to a one-line "fleet active" note.
*/
import { Bot, Check, Play, Wallet, X } from "../axiom/icons.js";
import { PanelHead } from "../axiom/Controls.js";
import { getCopy } from "../../lib/copy.js";
import { routePath } from "../../lib/routeRegistry.js";
import type { AppState } from "../../lib/models.js";
import type { ConsoleAction } from "../../lib/consoleStore.js";
import type { VaultDataEntry } from "../../hooks/useVaultDataBatch.js";

/** A step is done when the chain/store state it targets already exists. */
export function firstRunSteps(args: {
  hasAgent: boolean;
  hasFundedVault: boolean;
  hasTickReceipt: boolean;
}): { done: boolean[]; allDone: boolean } {
  const done = [args.hasAgent, args.hasFundedVault, args.hasTickReceipt];
  return { done, allDone: done.every(Boolean) };
}

/** Tick receipts are local rows with route "/tick" (FlowPage addFlowReceipt);
 * reverted/abandoned attempts are not a completed first run. */
export function hasCompletedTick(
  transactions: AppState["transactions"],
): boolean {
  return transactions.some(
    (tx) => tx.route === "/tick" && tx.state === "confirmed",
  );
}

/** Any vault row with a deposit — the same signal the Stat block trusts. */
export function hasFundedVault(vaultMap: Map<string, VaultDataEntry>): boolean {
  for (const entry of vaultMap.values())
    if (entry.depositsWei > 0n) return true;
  return false;
}

export function FirstRunChecklist({
  go,
  state,
  dispatch,
  agentsCount,
  vaultMap,
}: {
  go: (path: string) => void;
  state: AppState;
  dispatch: React.Dispatch<ConsoleAction>;
  agentsCount: number;
  vaultMap: Map<string, VaultDataEntry>;
}) {
  const copy = getCopy(state.settings.locale);
  const { done, allDone } = firstRunSteps({
    hasAgent: agentsCount > 0,
    hasFundedVault: hasFundedVault(vaultMap),
    hasTickReceipt: hasCompletedTick(state.transactions),
  });

  // All three done: the card collapses to a one-line status note — no steps.
  if (allDone)
    return (
      <section className="checklist-card checklist-done" aria-live="polite">
        <Check size={16} />
        <span>{copy.checklist.done}</span>
      </section>
    );

  const dismiss = () => dispatch({ type: "first-run-dismiss" });
  const steps = [
    {
      path: routePath("mint"),
      icon: <Bot size={16} />,
      ...copy.checklist.steps.mint,
      done: done[0],
    },
    {
      path: routePath("deposit"),
      icon: <Wallet size={16} />,
      ...copy.checklist.steps.deposit,
      done: done[1],
    },
    {
      path: routePath("tick"),
      icon: <Play size={16} />,
      ...copy.checklist.steps.tick,
      done: done[2],
    },
  ];

  return (
    <section className="checklist-card">
      <PanelHead title={copy.checklist.title}>
        <button
          className="text-link checklist-dismiss"
          onClick={dismiss}
          aria-label={copy.checklist.dismiss}
        >
          <X size={16} />
        </button>
      </PanelHead>
      <ol className="checklist-steps">
        {steps.map((step) => (
          <li key={step.path}>
            <button
              className="checklist-step"
              onClick={() => {
                if (!step.done) go(step.path);
              }}
              aria-disabled={step.done}
            >
              <span
                className={step.done ? "checklist-mark done" : "checklist-mark"}
              >
                {step.done ? <Check size={14} /> : step.icon}
              </span>
              <span className="checklist-copy">
                <strong>{step.label}</strong>
                <small>{step.hint}</small>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
