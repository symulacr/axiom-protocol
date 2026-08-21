/*
  OperationReviewSheet (ported from the v2 mockup; live wording). The single
  confirm surface over the v1 encode-relay hooks: review facts, then
  "Sign & execute" drives the real wallet call from FlowPage.

  P4: the sheet reads its copy from lib/copy.ts directly (locale via
  useUiStore) — review rows, fact labels, CTA vocabulary and the receipt/
  co-sign/handoff chrome localize like the rest of the flow body. The F-01
  co-sign step additionally carries the P4 cross-wallet handoff (share an
  acceptance link / paste the receiver's code) so a receiver on another
  device never dead-ends the transfer.
*/
import { AlertTriangle, Check, Copy, ShieldCheck, X } from "./axiom/icons.js";
import { createPortal } from "react-dom";
import type { FlowKind, OperationDraft } from "../lib/models.js";
import { APP_CHAIN, APP_CHAIN_ID } from "../config/wagmi.js";
import { useModalDismiss } from "../hooks/useModalDismiss.js";
import { useUiStore } from "../lib/uiStore.js";
import { getCopy, interpolate } from "../lib/copy.js";
import { truncateAddress } from "../utils/format.js";
import { ACCEPTANCE_CODE_SHAPE } from "../lib/transferHandoff.js";

type HandoffControl = {
  /** Receiver-signable URL (paused challenge, base64url typed data). */
  url: string;
  onCopyLink: () => void;
  /** Pasted acceptance code (two-way). */
  codeValue: string;
  onCodeChange: (value: string) => void;
  /** Verify + apply the code (disabled until it parses as a signature). */
  onApplyCode: () => void;
  /** Humanized apply error, if the last apply failed. */
  codeError: string | null;
  /** Acceptance applied + verified — primary becomes "Submit transfer". */
  applied: boolean;
  onSubmit: () => void;
};

type Props = {
  kind: FlowKind;
  draft: OperationDraft;
  agentName: string;
  onClose: () => void;
  onRetry: () => void;
  onExecute: () => void;
  busy: boolean;
  /** C-15: FlowPage computes the truthful wallet-prompt count from the live
   *  allowance; when provided it replaces the static payment fact row. */
  confirmationLabel?: string;
  /** Payment boundary 1: false when the live allowance already covers the
   *  amount (CTA relabeled — no wallet prompt fires on that click). */
  approvalNeeded?: boolean;
  /** C-07: vault flows show the resulting-balance estimate as an extra fact
   *  row (cheap — the vault read is already live on the flow page). */
  balanceFact?: { dt: string; dd: string };
  /** C-12: the payment token's on-chain symbol from the hook-layer cache —
   *  the confirm CTA interpolates it ("Pay 25 axmUSDC" on Galileo), never a
   *  hardcoded unit. */
  paymentSymbol?: string;
  /** F-01: cross-party transfer paused for the receiver co-sign. When set
   *  (and no recoverable error is showing), the sheet's primary action becomes
   *  the receiver signature; `blocked` renders the honest blocker (the wallet
   *  cannot sign for the receiver) WITH the P4 handoff remedies (link + code
   *  paste) — no dead end. Copy is read from copy.ts inside the sheet. */
  coSign?: {
    receiver: string;
    blocked: boolean;
    onSign: () => void;
    handoff?: HandoffControl;
  };
};

export function OperationReviewSheet({
  kind,
  draft,
  agentName,
  onClose,
  onRetry,
  onExecute,
  busy,
  confirmationLabel,
  approvalNeeded,
  balanceFact,
  paymentSymbol,
  coSign,
}: Props) {
  const { state } = useUiStore();
  const copy = getCopy(state.settings.locale);
  const f = copy.flowUi;
  const flow = copy.flows[kind];
  // C-14 dismiss trio: Esc + focus restore here; backdrop via layer onMouseDown
  // below; explicit close via the X and "Edit details". Sheet is the highest-
  // stakes dialog — dismissing never submits (submission is wallet-gated).
  useModalDismiss(onClose);
  const paymentNeedsApproval =
    kind === "payment" && draft.phase === "approval-required";
  const paymentReady = kind === "payment" && draft.phase === "payment-required";
  const isRecoverableError = draft.phase === "recoverable-error";
  // F-01: the co-sign step replaces the normal primary action whenever a
  // cross-party transfer is paused for the receiver signature (and no
  // execution error is being surfaced).
  const coSignActive = coSign !== undefined && !isRecoverableError;
  const handoff = coSignActive ? coSign?.handoff : undefined;
  const handoffApplied = handoff?.applied === true;
  const codeLooksSignable = ACCEPTANCE_CODE_SHAPE.test(
    handoff?.codeValue?.trim() ?? "",
  );
  // One copper primary per view (CTA hierarchy contract):
  //  - applied handoff → Submit transfer (the sender's wallet boundary)
  //  - co-sign possible → Sign as receiver
  //  - co-sign blocked  → Apply acceptance (the only remaining path; disabled
  //    until a signature-shaped code is pasted)
  const primaryLabel = isRecoverableError
    ? kind === "payment"
      ? f.restartApproval
      : f.resumeReview
    : coSignActive
      ? handoffApplied
        ? f.submitTransfer
        : coSign!.blocked
          ? f.handoffApply
          : copy.flowUi.coSignAction
      : paymentNeedsApproval
        ? approvalNeeded === false
          ? f.primaryContinuePayment
          : f.primaryApprove
        : paymentReady
          ? interpolate(f.payCta, {
              amount: draft.value,
              symbol: paymentSymbol ?? "",
            }).trimEnd()
          : f.primarySign;
  const primaryDisabled =
    busy ||
    (coSignActive && coSign!.blocked && !handoffApplied && !codeLooksSignable);
  const onPrimary = (): void => {
    if (isRecoverableError) {
      onRetry();
      return;
    }
    if (coSignActive) {
      if (handoffApplied) handoff?.onSubmit();
      else if (coSign!.blocked) handoff?.onApplyCode();
      else coSign!.onSign();
      return;
    }
    onExecute();
  };
  const confirmationCount =
    confirmationLabel ?? (kind === "payment" ? f.confirmTwo : f.confirmOne);
  return createPortal(
    <div
      className="operation-review-layer"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="operation-review-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="operation-review-title"
        aria-describedby={draft.error ? "operation-review-error" : undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="operation-review-head">
          <div>
            <span className="eyebrow">
              {interpolate(f.reviewEyebrow, { kind: flow.receiptKind })}
            </span>
            <h2 id="operation-review-title">{f.reviewTitle}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={f.closeReviewA11y}
          >
            <X size={16} />
          </button>
        </header>
        <div className="review-decision">
          <span className="review-seal">
            <ShieldCheck size={17} />
          </span>
          <div>
            <span className="eyebrow">{f.effectEyebrow}</span>
            <strong>{flow.consequence}</strong>
          </div>
        </div>
        <dl className="review-facts">
          {/* S1 (audit 06 FINDING-009 / duplication map #3): for mint there is
              no agent yet — agentName IS draft.value, so the TARGET AGENT row
              repeated the AGENT NAME row verbatim. Other kinds keep both rows
              (they are different facts there). */}
          {kind !== "mint" && (
            <div>
              <dt>{f.factAgent}</dt>
              <dd>{agentName}</dd>
            </div>
          )}
          <div>
            <dt>
              {kind === "payment" || kind === "deposit" || kind === "withdraw"
                ? f.factAmount
                : kind === "transfer"
                  ? f.factRecipient
                  : kind === "mint"
                    ? f.factName
                    : f.factInstruction}
            </dt>
            <dd className="mono">{draft.value}</dd>
          </div>
          {balanceFact && (
            <div>
              <dt>{balanceFact.dt}</dt>
              <dd className="mono">{balanceFact.dd}</dd>
            </div>
          )}
          <div>
            <dt>{f.factNetwork}</dt>
            <dd>
              {interpolate(f.networkFact, {
                chainName: APP_CHAIN.name,
                chainId: APP_CHAIN_ID,
              })}
            </dd>
          </div>
          <div>
            <dt>{f.factBoundary}</dt>
            <dd>{confirmationCount}</dd>
          </div>
        </dl>
        <div className="review-proof">
          <Check size={14} />
          <span>{flow.proofLine}</span>
        </div>
        {coSignActive && (handoffApplied || !coSign!.blocked) && (
          <div className="review-cosign" data-testid="transfer-cosign">
            <ShieldCheck size={14} />
            <div>
              <strong>{f.coSignTitle}</strong>
              <p>{f.coSignBody(truncateAddress(coSign!.receiver))}</p>
              <small>{f.coSignNote}</small>
            </div>
          </div>
        )}
        {coSignActive && handoffApplied && (
          <div className="review-cosign" data-testid="transfer-handoff-applied">
            <Check size={14} />
            <div>
              <strong>{f.handoffAppliedTitle}</strong>
              <p>{f.handoffAppliedNote}</p>
            </div>
          </div>
        )}
        {coSignActive && coSign!.blocked && (
          <div
            className="review-error review-cosign-blocked"
            role="alert"
            data-testid="transfer-cosign-blocked"
          >
            <AlertTriangle size={14} />
            <div>
              <strong>{f.coSignBlockedTitle}</strong>
              <p>{f.coSignBlockedBody(truncateAddress(coSign!.receiver))}</p>
            </div>
          </div>
        )}
        {coSignActive && handoff && !handoffApplied && (
          <div className="review-handoff" data-testid="transfer-handoff">
            <div>
              <strong>{f.handoffTitle}</strong>
              <p>{f.handoffBody}</p>
            </div>
            <div className="review-handoff-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={handoff.onCopyLink}
              >
                <Copy size={14} />
                {f.handoffCopyLink}
              </button>
            </div>
            <label className="field">
              <span className="field-label">{f.handoffPasteLabel}</span>
              <span className="field-control">
                <input
                  className="axiom-field mono"
                  value={handoff.codeValue}
                  onChange={(event) => handoff.onCodeChange(event.target.value)}
                  placeholder="0x…"
                  spellCheck={false}
                  maxLength={132}
                  aria-label={f.handoffPasteLabel}
                />
              </span>
              <span className="field-hint">{f.handoffPasteHint}</span>
            </label>
            {handoff.codeError && (
              <div className="review-error" role="alert">
                <AlertTriangle size={14} />
                {handoff.codeError}
              </div>
            )}
          </div>
        )}
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
            onClick={onPrimary}
            disabled={primaryDisabled}
            aria-busy={busy || undefined}
          >
            <ShieldCheck size={15} />
            {busy ? f.awaitingWallet : primaryLabel}
          </button>
          <button className="button button-ghost" onClick={onClose}>
            {f.editDetails}
          </button>
        </div>
        <p className="review-disclaimer">{f.reviewDisclaimer}</p>
      </section>
    </div>,
    document.body,
  );
}
