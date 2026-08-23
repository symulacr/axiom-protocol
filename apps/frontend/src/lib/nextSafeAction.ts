/* Next-safe-action engine. "Fund agent" targets the
 * first unfunded agent from the live portfolio (fallback: the payment route
 * without an agent); "recover receipt" keys off flow drafts in recoverable
 * error, and storage inspection stays the read-only proof check.
 * Copy comes from copy.strip (05 — the strip localizes with the
 * page body); no chain/token literal ever originates here. */
import type { AppState } from "./models";
import type { Copy } from "./copy";

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
  strip: Copy["strip"],
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
      eyebrow: strip.reviewEyebrow,
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

  actions.push({
    id: "fund-agent",
    eyebrow: strip.nextEyebrow,
    title: fundTarget ? strip.fundTitle(fundTarget.tokenId) : strip.fundTitle(),
    summary: strip.fundSummary,
    impact: strip.fundImpact,
    proofLabel: strip.proofAgent,
    proofValue: fundTarget ? `#${fundTarget.tokenId}` : strip.selectInFlow,
    path: fundTarget
      ? `/payment?agent=${fundTarget.tokenId}&intent=fund&stage=amount`
      : "/payment?intent=fund&stage=amount",
    priority: "high",
    shortcut: "Alt P",
  });

  actions.push({
    id: "inspect-storage",
    eyebrow: strip.proofCheckEyebrow,
    title: strip.inspectTitle,
    summary: strip.inspectSummary,
    impact: strip.inspectImpact,
    proofLabel: strip.proofRoot,
    // No storage backend exists yet (StoragePage is a labeled demo) — an
    // honest "nothing indexed" marker instead of the old fixture hash.
    proofValue: "—",
    path: "/storage",
    priority: "normal",
    shortcut: "Alt 5",
  });

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
  if (path.startsWith("/storage"))
    return (
      actions.find((action) => action.id === "inspect-storage") ?? actions[0]
    );
  return actions[0];
}
