/* Next-safe-action engine ported from the v2 mockup. "Fund agent" targets the
 * first unfunded agent from the live portfolio (fallback: the payment route
 * without an agent); "recover receipt" keys off flow drafts in recoverable
 * error, and storage inspection stays the read-only proof check. */
import type { AppState } from "./models";

export type NextSafeAction = {
  id: "recover-receipt" | "fund-agent" | "inspect-storage";
  eyebrow: string;
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
): NextSafeAction[] {
  const actions: NextSafeAction[] = [];
  const recoverable =
    state.transactions.find((tx) =>
      ["reverted", "rejected", "stale"].includes(tx.state),
    ) ??
    (Object.values(state.operationDrafts).find(
      (draft) => draft.phase === "recoverable-error",
    )
      ? {
          kind: Object.values(state.operationDrafts).find(
            (draft) => draft.phase === "recoverable-error",
          )!.kind,
          hash:
            state.operationDrafts[
              Object.values(state.operationDrafts).find(
                (draft) => draft.phase === "recoverable-error",
              )!.kind
            ].receiptId ?? "draft",
        }
      : undefined);

  if (recoverable) {
    actions.push({
      id: "recover-receipt",
      eyebrow: "NOW / NEEDS REVIEW",
      title: `Review ${recoverable.kind}`,
      summary: "Recover the existing receipt before retrying.",
      impact: "No asset movement until you continue.",
      proofLabel: "RECEIPT",
      proofValue: recoverable.hash,
      path: `/transactions?filter=review`,
      priority: "critical",
      shortcut: "Alt 4",
    });
  }

  actions.push({
    id: "fund-agent",
    eyebrow: "NEXT SAFE ACTION",
    title: fundTarget
      ? `Fund agent #${fundTarget.tokenId}`
      : "Open payment route",
    summary: "Review an exact ERC-20 allowance before any value moves.",
    impact: "Allowance and payment confirm separately.",
    proofLabel: "AGENT",
    proofValue: fundTarget ? `#${fundTarget.tokenId}` : "select in flow",
    path: fundTarget
      ? `/payment?agent=${fundTarget.tokenId}&intent=fund&stage=amount`
      : "/payment?intent=fund&stage=amount",
    priority: "high",
    shortcut: "Alt P",
  });

  actions.push({
    id: "inspect-storage",
    eyebrow: "PROOF CHECK",
    title: "Inspect storage root",
    summary: "Check the indexed root and integrity state.",
    impact: "Read-only. No wallet request.",
    proofLabel: "ROOT",
    proofValue: "0x3b9…f10",
    path: "/storage?intent=inspect-root",
    priority: "normal",
    shortcut: "Alt 5",
  });

  return actions;
}

export function getRouteAction(
  state: AppState,
  path: string,
  fundTarget: FundTarget = undefined,
) {
  const actions = getNextSafeActions(state, fundTarget);
  if (path.startsWith("/agents/") || path.startsWith("/payment"))
    return actions.find((action) => action.id === "fund-agent") ?? actions[0];
  if (path.startsWith("/storage"))
    return (
      actions.find((action) => action.id === "inspect-storage") ?? actions[0]
    );
  return actions[0];
}
