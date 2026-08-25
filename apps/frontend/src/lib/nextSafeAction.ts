/* Next-safe-action engine. "Fund agent" appears only with a concrete
 * unfunded target from the caller (U17: the old unconditional push pointed
 * at a fallback route with no agent — noise, not signal); "recover receipt"
 * keys off flow drafts in recoverable error. Storage inspection is NOT
 * emitted (U18: no real storage backend exists yet — the action pointed at
 * a labeled demo page). The list may legitimately be empty; the strip
 * renders nothing then.
 * Copy comes from copy.strip (05 — the strip localizes with the
 * page body); no chain/token literal ever originates here. */
import { isRecoverableTx, type AppState } from "./models";
import type { Copy } from "./copy";

export type NextSafeAction = {
  id: "recover-receipt" | "fund-agent" | "inspect-storage";
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

  // U17: gated on a concrete target — the caller decides which vault is
  // unfunded; no target means no fund action, never a generic fallback.
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

  // U18: no "inspect-storage" push — until a real storage backend exists the
  // demo-page action stays out of the strip (route + page remain for deep links).

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
  // No /storage branch: inspect-storage is no longer emitted (U18).
  return actions[0];
}
