/* Next-safe-action engine: derives the priority strip actions from app state.
 * The list may legitimately be empty; the strip renders nothing then. */
import { isRecoverableTx, type AppState } from "./models";
import type { Copy } from "./copy";

type NextSafeAction = {
  id: "recover-receipt" | "fund-agent";
  title: string;
  summary: string;
  impact: string;
  proofLabel: string;
  proofValue: string;
  path: string;
  priority: "critical" | "high" | "normal";
  shortcut: string;
};

export type FundTarget = { tokenId: string } | undefined;

export function getNextSafeActions(
  state: AppState,
  fundTarget: FundTarget = undefined,
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

  // U17: gated on a concrete target — no generic fallback.
  if (fundTarget) {
    actions.push({
      id: "fund-agent",
      title: strip.fundTitle(fundTarget.tokenId),
      summary: strip.fundSummary,
      impact: strip.fundImpact,
      proofLabel: strip.proofAgent,
      proofValue: `#${fundTarget.tokenId}`,
      path: `/payment?agent=${fundTarget.tokenId}&intent=fund&stage=amount`,
      priority: "high",
      shortcut: "Alt P",
    });
  }

  // U18: no storage push until a real backend exists.
  return actions;
}

export function getRouteAction(
  state: AppState,
  path: string,
  fundTarget: FundTarget = undefined,
  strip: Copy["strip"],
) {
  const actions = getNextSafeActions(state, fundTarget, strip);
  if (path.startsWith("/agents/") || path.startsWith("/payment"))
    return actions.find((action) => action.id === "fund-agent") ?? actions[0];
  return actions[0];
}
