/*
  OperationReviewSheet (ported from the v2 mockup; live wording). The single
  confirm surface over the v1 encode-relay hooks: review facts, then
  "Sign & execute" drives the real wallet call from FlowPage.
*/
import { AlertTriangle, Check, ShieldCheck, X } from "./axiom/icons.js";
import { createPortal } from "react-dom";
import type { FlowKind, OperationDraft } from "../lib/models.js";
import { APP_CHAIN_ID } from "../config/wagmi.js";

type Props = {
  kind: FlowKind;
  draft: OperationDraft;
  agentName: string;
  onClose: () => void;
  onRetry: () => void;
  onExecute: () => void;
  busy: boolean;
};

const labels: Record<FlowKind, { consequence: string; proof: string }> = {
  mint: {
    consequence: "Create an agent identity after confirmation.",
    proof: "Records metadata hash and oracle acknowledgement.",
  },
  payment: {
    consequence: "Fund the selected agent with the reviewed amount.",
    proof: "Bounds the allowance; payment confirms separately.",
  },
  transfer: {
    consequence: "Send the reviewed proof to this recipient.",
    proof: "Binds the recipient challenge and expiry.",
  },
  tick: {
    consequence: "Launch one cancellable, bounded instruction.",
    proof: "Records the provider route and execution evidence.",
  },
};

export function OperationReviewSheet({
  kind,
  draft,
  agentName,
  onClose,
  onRetry,
  onExecute,
  busy,
}: Props) {
  const details = labels[kind];
  const paymentNeedsApproval =
    kind === "payment" && draft.phase === "approval-required";
  const paymentReady = kind === "payment" && draft.phase === "payment-required";
  const isRecoverableError = draft.phase === "recoverable-error";
  const primaryLabel = isRecoverableError
    ? kind === "payment"
      ? "Restart approval review"
      : "Resume review"
    : paymentNeedsApproval
      ? "Approve exact allowance"
      : paymentReady
        ? `Pay ${draft.value} USDC`
        : "Sign & execute";
  const confirmationCount =
    kind === "payment"
      ? "2 wallet confirmations required"
      : "1 wallet confirmation required";
  return createPortal(
    <div className="operation-review-layer" role="presentation">
      <section
        className="operation-review-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="operation-review-title"
        aria-describedby={draft.error ? "operation-review-error" : undefined}
      >
        <header className="operation-review-head">
          <div>
            <span className="eyebrow">REVIEW / {kind.toUpperCase()}</span>
            <h2 id="operation-review-title">Review operation.</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close review and edit operation details"
          >
            <X size={16} />
          </button>
        </header>
        <div className="review-decision">
          <span className="review-seal">
            <ShieldCheck size={17} />
          </span>
          <div>
            <span className="eyebrow">EFFECT</span>
            <strong>{details.consequence}</strong>
          </div>
        </div>
        <dl className="review-facts">
          <div>
            <dt>Target agent</dt>
            <dd>{agentName}</dd>
          </div>
          <div>
            <dt>
              {kind === "payment"
                ? "Amount"
                : kind === "transfer"
                  ? "Recipient"
                  : kind === "mint"
                    ? "Agent name"
                    : "Instruction"}
            </dt>
            <dd className="mono">{draft.value}</dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>0G · chain {APP_CHAIN_ID}</dd>
          </div>
          <div>
            <dt>Boundary</dt>
            <dd>{confirmationCount}</dd>
          </div>
        </dl>
        <div className="review-proof">
          <Check size={14} />
          <span>{details.proof}</span>
        </div>
        {draft.error && (
          <div
            id="operation-review-error"
            className="review-error"
            role="alert"
          >
            <AlertTriangle size={14} />
            {draft.error}
          </div>
        )}
        <div className="review-actions" aria-label="Operation actions">
          <button
            className="button button-primary"
            onClick={isRecoverableError ? onRetry : onExecute}
            disabled={busy}
            aria-busy={busy || undefined}
          >
            <ShieldCheck size={15} />
            {busy ? "Awaiting wallet" : primaryLabel}
          </button>
          <button className="button button-ghost" onClick={onClose}>
            Edit details
          </button>
        </div>
        <p className="review-disclaimer">
          Nothing is submitted until you confirm in the wallet.
        </p>
      </section>
    </div>,
    document.body,
  );
}
