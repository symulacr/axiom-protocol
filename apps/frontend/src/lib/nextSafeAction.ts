/* Next-safe-action engine: derives the priority strip actions from app state.
 * The list may legitimately be empty; the strip renders nothing then. */
import { isRecoverableTx, type AppState } from "./models";
import type { Copy } from "./copy";

type NextSafeAction = {
  id: "recover-receipt";
  title: string;
  summary: string;
  impact: string;
  proofLabel: string;
  proofValue: string;
  path: string;
  priority: "critical" | "high" | "normal";
  shortcut: string;
};

// U17/U18 lineage: the fund-agent arm was gated on a FundTarget prop no
// caller ever passed — removed with its prop chain and copy keys. Re-add a
// target when a real funding surface wires one in.
export function getNextSafeActions(
  state: AppState,
  strip: Copy["strip"],
): NextSafeAction[] {
  const actions: NextSafeAction[] = [];
  const recoverableDraft = Object.values(state.operationDrafts).find(
    (draft) => draft.phase === "recoverable-error",
  );
  const recoverable =
    state.transactions.find((tx) => isRecoverableTx(tx.state)) ??
    (recoverableDraft
      ? {
          kind: recoverableDraft.kind,
          hash: recoverableDraft.receiptId ?? "draft",
        }
      : undefined);

  if (recoverable) {
    actions.push({
      id: "recover-receipt",
      title: strip.reviewTitle(recoverable.kind),
      summary: strip.reviewSummary,
      impact: strip.reviewImpact,
      proofLabel: strip.proofReceipt,
      proofValue: recoverable.hash,
      path: `/transactions?filter=review`,
      priority: "critical",
      shortcut: "Alt 4",
    });
  }

  // U18: no storage push until a real backend exists.
  return actions;
}

export function getRouteAction(
  state: AppState,
  strip: Copy["strip"],
) {
  return getNextSafeActions(state, strip)[0];
}
