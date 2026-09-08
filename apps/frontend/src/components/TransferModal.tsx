import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { isAddress } from "viem";
import { toast } from "sonner";
import { useAccount } from "wagmi";
import { apiFetch } from "../utils/apiFetch.js";
import {
  useTransfer,
  type TransferInput,
  type TransferPhase,
  type TransferResponse,
} from "../hooks/useTransfer.js";
import { Button, Field, Status } from "./axiom/Controls.js";
import { AlertTriangle, Check, ShieldCheck, X } from "./axiom/icons.js";
import { useModalDismiss } from "../hooks/useModalDismiss.js";
import { humanizeError, truncateAddress } from "../utils/format.js";
import {
  buildTransferInput as assembleTransferInput,
  runCoSignStep,
} from "../lib/transferHandoff.js";
import { ReceiverKeyUnknownError } from "../hooks/useTransfer.js";
import { useUiStore } from "../lib/uiStore.js";
import { getCopy } from "../lib/copy.js";
import type { Copy } from "../lib/copy.js";

/*
  Shared overlay shell + Controls kit; title, co-sign step and the full body
  localize via copy.flowUi (I4: the flow-body i18n deferral landed).
*/

const RECEIVER_PUBKEY_HEX_LENGTH = 130;

/** Every failed phase retries identically: Edit regenerates a fresh nonce
 * (single-use). Only the idle phase has no retry hint to offer — the copy
 * lives in flowUi.transferRetryHint, applied where the error renders. */

type TransferModalProps = {
  tokenId: bigint;
  open: boolean;
  onClose?: () => void;
  onSuccess?: (txHash: `0x${string}`) => void;
};

/** Error codes only — the localized strings live in flowUi.transferErrKey*. */
function validatePubKey(
  value: string,
): "required" | "prefix" | "length" | null {
  if (value.length === 0) return "required";
  if (!value.startsWith("0x")) return "prefix";
  if (value.length !== RECEIVER_PUBKEY_HEX_LENGTH) {
    return "length";
  }
  return null;
}

/** Shared modal shell: the app's overlay layer with the dismiss trio via useModalDismiss. */
function ModalSheet({
  title,
  closeLabel,
  onClose,
  children,
}: {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}): ReactElement {
  const titleId = useId();
  // Dismiss contract via useModalDismiss: Esc + Tab trap + initial focus + focus restore.
  const sheetRef = useRef<HTMLElement>(null);
  useModalDismiss(onClose, sheetRef);
  return createPortal(
    <div
      className="operation-review-layer"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        ref={sheetRef}
        className="operation-review-sheet transfer-modal-sheet"
        /* R13 (baseline-ui): the ownership handoff is irreversible —
           AlertDialog semantics. */
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="operation-review-head">
          <div>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <X size={16} />
          </button>
        </header>
        <div className="transfer-modal-body">{children}</div>
      </section>
    </div>,
    document.body,
  );
}

function PhaseIndicator({
  transferPhase,
  labels,
}: {
  transferPhase: TransferPhase;
  labels: Record<TransferPhase, string>;
}): ReactElement {
  return (
    <Status
      label={labels[transferPhase] ?? transferPhase}
      tone={transferPhase === "idle" ? "muted" : "live"}
    />
  );
}

function TransferFormPhase({
  formId,
  receiverAddress,
  onAddressChange,
  addressError,
  receiverPubKey,
  onPubKeyChange,
  pubKeyError,
  pubkeyFallback,
  pubkeyResolveStatus,
  pubkeyFallbackSummary,
  pubkeyResolvePending,
  pubkeyResolveFailed,
  pubkeyResolveResolved,
  oldDataEncryptionKey,
  onOldDataKeyChange,
  oldDataUri,
  onOldDataUriChange,
  rekeyError,
  mergedError,
  cancel,
  canSubmit,
  isLoading,
  onSubmit,
  f,
}: {
  formId: string;
  receiverAddress: string;
  onAddressChange: (value: string) => void;
  addressError: string | null;
  receiverPubKey: string;
  onPubKeyChange: (value: string) => void;
  pubKeyError: string | null;
  /** P3 §(b)#4: the Advanced paste field only appears when the address has
   * no on-chain key (NO_ONCHAIN_KEY) — the normal path never asks for hex. */
  pubkeyFallback: boolean;
  pubkeyResolveStatus: "idle" | "pending" | "failed" | "resolved";
  pubkeyFallbackSummary: string;
  pubkeyResolvePending: string;
  pubkeyResolveFailed: string;
  pubkeyResolveResolved: string;
  oldDataEncryptionKey: string;
  onOldDataKeyChange: (value: string) => void;
  oldDataUri: string;
  onOldDataUriChange: (value: string) => void;
  rekeyError: string | null;
  mergedError: ReactNode;
  cancel: () => void;
  canSubmit: boolean;
  isLoading: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  f: Copy["flowUi"];
}): ReactElement {
  return (
    <form onSubmit={onSubmit}>
      <p className="transfer-modal-lede">{f.transferLede}</p>

      <Field
        id={`${formId}-to`}
        label={f.transferReceiverLabel}
        value={receiverAddress}
        onChange={onAddressChange}
        placeholder="0x…"
        maxLength={42}
        mono
        required
        error={addressError ?? undefined}
      />

      {pubkeyFallback ? (
        <>
          <p className="transfer-modal-lede">{pubkeyResolveFailed}</p>
          <details className="transfer-modal-details">
            <summary>{pubkeyFallbackSummary}</summary>
            <Field
              id={`${formId}-pubkey`}
              label={f.transferPubkeyLabel}
              value={receiverPubKey}
              onChange={onPubKeyChange}
              placeholder={f.transferPubkeyPlaceholder}
              maxLength={RECEIVER_PUBKEY_HEX_LENGTH}
              multiline
              rows={3}
              mono
              error={pubKeyError ?? undefined}
            />
          </details>
        </>
      ) : pubkeyResolveStatus === "pending" ? (
        <p className="transfer-modal-lede">{pubkeyResolvePending}</p>
      ) : (
        pubkeyResolveStatus === "resolved" && (
          <p className="transfer-modal-lede">{pubkeyResolveResolved}</p>
        )
      )}

      <details className="transfer-modal-details">
        <summary>{f.transferRekeySummary}</summary>
        <p className="transfer-modal-lede">{f.transferRekeyHint}</p>
        <Field
          id={`${formId}-oldkey`}
          label={f.transferOldKeyLabel}
          value={oldDataEncryptionKey}
          onChange={onOldDataKeyChange}
          placeholder={f.transferOldKeyPlaceholder}
          maxLength={256}
          mono
        />
        <Field
          id={`${formId}-olduri`}
          label={f.transferOldUriLabel}
          value={oldDataUri}
          onChange={onOldDataUriChange}
          placeholder={f.transferOldUriPlaceholder}
          maxLength={128}
          mono
          error={rekeyError ?? undefined}
        />
      </details>

      {mergedError}

      <div className="review-actions">
        <Button variant="ghost" onClick={cancel} disabled={isLoading}>
          {f.cancel}
        </Button>
        <Button
          type="submit"
          disabled={!canSubmit || rekeyError !== null}
          busy={isLoading}
          icon={<ShieldCheck size={16} />}
        >
          {isLoading ? f.transferSigning : f.transferSignAction}
        </Button>
      </div>
    </form>
  );
}

function ConfirmTransferPhase({
  signature,
  mergedError,
  isLoading,
  onEdit,
  onConfirm,
  f,
}: {
  signature: TransferResponse | null;
  mergedError: ReactNode;
  isLoading: boolean;
  onEdit: () => void;
  onConfirm: () => Promise<void>;
  f: Copy["flowUi"];
}): ReactElement {
  return (
    <form
      onSubmit={(e): void => {
        e.preventDefault();
        void onConfirm();
      }}
    >
      <p className="transfer-modal-lede">{f.transferConfirmLede}</p>

      {signature !== null && signature.rekeyed === true && (
        <div className="review-proof">
          <Check size={14} />
          <span>
            <strong>{f.transferAuthorizedTitle}</strong>:{" "}
            {f.transferAuthorizedBody}
            {signature.newDataHash !== undefined && (
              <details>
                <summary>{f.transferProofDetails}</summary>
                {f.transferNewHashLabel}{" "}
                <span className="mono">{signature.newDataHash}</span>
                {signature.ownershipProof?.sealedKey !== undefined && (
                  <>
                    {" "}
                    {f.transferSealedKeyLabel}{" "}
                    <span className="mono">
                      {truncateAddress(
                        signature.ownershipProof.sealedKey,
                        10,
                        6,
                      )}
                    </span>
                  </>
                )}
              </details>
            )}
          </span>
        </div>
      )}

      {signature !== null && (
        <dl className="review-facts">
          <div>
            <dt>{f.transferOwnershipProof}</dt>
            <dd className="mono">{signature.signer ?? "—"}</dd>
          </div>
          {signature.ownershipProof !== undefined && (
            <div>
              <dt>{f.transferValidUntil}</dt>
              <dd className="mono">
                {new Date(
                  Number(signature.ownershipProof.validUntil) * 1000,
                ).toISOString()}
              </dd>
            </div>
          )}
          {signature.accessSigner !== undefined && (
            <div>
              <dt>{f.transferAcceptedBy}</dt>
              <dd className="mono">{signature.accessSigner}</dd>
            </div>
          )}
        </dl>
      )}

      {mergedError}

      <div className="review-actions">
        <Button variant="ghost" onClick={onEdit} disabled={isLoading}>
          {f.edit}
        </Button>
        <Button
          type="submit"
          disabled={isLoading || signature === null}
          busy={isLoading}
          icon={<ShieldCheck size={16} />}
        >
          {isLoading ? f.transferSubmitting : f.transferConfirmAction}
        </Button>
      </div>
    </form>
  );
}

/** explicit receiver co-sign step — the AccessProof must be signed by
 * the recipient's wallet (protocol requirement), so a cross-party transfer
 * pauses here between the oracle challenge and the sender's submission. The
 * blocked state is honest: when this wallet cannot expose the receiver
 * account there is no retry, only the two real remedies. */
function CoSignPhase({
  receiver,
  blocked,
  isLoading,
  copy,
  onSign,
  onEdit,
}: {
  receiver: `0x${string}`;
  blocked: boolean;
  isLoading: boolean;
  copy: {
    title: string;
    body: string;
    action: string;
    note: string;
    blockedTitle: string;
    blockedBody: string;
    recipientLabel: string;
    editLabel: string;
  };
  onSign: () => Promise<void>;
  onEdit: () => void;
}): ReactElement {
  return (
    <form
      onSubmit={(e): void => {
        e.preventDefault();
        if (!blocked) void onSign();
      }}
    >
      <div className="review-cosign">
        <ShieldCheck size={14} />
        <div>
          <strong>{copy.title}</strong>
          <p>{copy.body}</p>
          <small>{copy.note}</small>
        </div>
      </div>

      <dl className="review-facts">
        <div>
          <dt>{copy.recipientLabel}</dt>
          <dd className="mono">{receiver}</dd>
        </div>
      </dl>

      {blocked && (
        <div className="review-error review-cosign-blocked" role="alert">
          <AlertTriangle size={14} />
          <div>
            <strong>{copy.blockedTitle}</strong>
            <p>{copy.blockedBody}</p>
          </div>
        </div>
      )}

      <div className="review-actions">
        <Button variant="ghost" onClick={onEdit} disabled={isLoading}>
          {copy.editLabel}
        </Button>
        {!blocked && (
          <Button
            type="submit"
            disabled={isLoading}
            busy={isLoading}
            icon={<ShieldCheck size={16} />}
          >
            {copy.action}
          </Button>
        )}
      </div>
    </form>
  );
}

export function TransferModal({
  tokenId,
  open,
  onClose,
  onSuccess,
}: TransferModalProps): ReactElement {
  const formId = useId();

  const { address: from, isConnected } = useAccount();
  const {
    prepare,
    coSign,
    confirm,
    isLoading,
    error,
    signature,
    coSignReceiver,
    reset,
    transferPhase,
  } = useTransfer();
  const { state: uiState } = useUiStore();
  const flowCopy = getCopy(uiState.settings.locale).flowUi;

  const retryGuidance = useMemo(() => {
    if (!error) return null;

    if (transferPhase !== "idle") return flowCopy.transferRetryHint;

    const msg = error.message.toLowerCase();
    if (msg.includes("challenge")) {
      return flowCopy.transferErrChallenge;
    }
    if (msg.includes("final") || msg.includes("proof struct")) {
      return flowCopy.transferErrSubmit;
    }
    return flowCopy.transferErrGeneric;
  }, [error, transferPhase, flowCopy]);

  const [receiverAddress, setReceiverAddress] = useState("");
  const [receiverPubKey, setReceiverPubKey] = useState("");
  // P3 §(b)#4: when the address resolves to NO_ONCHAIN_KEY the Advanced paste
  // field (spec-mandated fallback) is revealed; reset whenever the address changes.
  const [pubkeyFallback, setPubkeyFallback] = useState(false);
  const [pubkeyResolveStatus, setPubkeyResolveStatus] = useState<
    "idle" | "pending" | "failed" | "resolved"
  >("idle");
  const [oldDataEncryptionKey, setOldDataEncryptionKey] = useState("");
  const [oldDataUri, setOldDataUri] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "co-sign" | "review">("form");
  const [coSignBlocked, setCoSignBlocked] = useState(false);

  const setOpen = useCallback(
    (next: boolean): void => {
      if (!next) onClose?.();
    },
    [onClose],
  );

  // Probe the registry as soon as a valid address is typed: its verdict decides
  // whether the Advanced paste fallback is needed before submit time.
  useEffect(() => {
    setPubkeyFallback(false);
    setPubkeyResolveStatus("idle");
    if (!isAddress(receiverAddress)) return;
    let cancelled = false;
    setPubkeyResolveStatus("pending");
    apiFetch<{ receiverPubKey64?: string }>(
      `/v1/registry/pubkey/${receiverAddress}`,
    )
      .then(() => {
        if (!cancelled) setPubkeyResolveStatus("resolved");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPubkeyResolveStatus("failed");
        if (
          err instanceof ReceiverKeyUnknownError ||
          (err instanceof Error && err.message.includes("NO_ONCHAIN_KEY"))
        ) {
          setPubkeyFallback(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [receiverAddress]);
  const handleTransferred = useCallback(
    (txHash: `0x${string}`): void => {
      toast.success(flowCopy.transferConfirmedToast(txHash.slice(0, 10)));
      onSuccess?.(txHash);
    },
    [onSuccess, flowCopy],
  );

  const pubKeyError = useMemo(() => {
    if (receiverPubKey.length === 0) return null;
    const code = validatePubKey(receiverPubKey);
    if (code === null) return null;
    if (code === "required") return flowCopy.transferErrKeyRequired;
    if (code === "prefix") return flowCopy.transferErrKeyPrefix;
    return flowCopy.transferErrKeyLength(RECEIVER_PUBKEY_HEX_LENGTH);
  }, [receiverPubKey, flowCopy]);
  const addressError = useMemo(
    () =>
      receiverAddress.length > 0 && !isAddress(receiverAddress)
        ? flowCopy.errRecipientAddress
        : null,
    [receiverAddress, flowCopy],
  );
  const canSubmit =
    isConnected &&
    from !== undefined &&
    receiverAddress.length > 0 &&
    addressError === null &&
    pubKeyError === null &&
    !isLoading;
  const rekeyError = useMemo(() => {
    const hasKey = oldDataEncryptionKey.length > 0;
    const hasUri = oldDataUri.length > 0;
    if (hasKey !== hasUri) {
      return flowCopy.transferErrRekeyPair;
    }
    return null;
  }, [oldDataEncryptionKey, oldDataUri, flowCopy]);
  const buildInput = useCallback((): TransferInput => {
    // P3 §(b)#4: no client nonce, no required pubkey — the hook resolves the
    // receiver key from the address at prepare time; a manual paste wins.
    return assembleTransferInput(
      {
        tokenId,
        to: receiverAddress,
        receiverPubKeyManual: receiverPubKey,
      },
      { oldDataEncryptionKey, oldDataUri },
    );
  }, [
    oldDataEncryptionKey,
    oldDataUri,
    receiverAddress,
    receiverPubKey,
    tokenId,
  ]);

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      if (!canSubmit || !from || rekeyError !== null) return;
      setSubmitError(null);
      setCoSignBlocked(false);
      try {
        const prepared = await prepare(buildInput());
        // Cross-party transfers pause for the receiver co-sign step; self-transfers go straight to review.
        setPhase(prepared.status === "co-sign-required" ? "co-sign" : "review");
      } catch (err) {
        setSubmitError(humanizeError(err));
      }
    },
    [buildInput, canSubmit, from, prepare, rekeyError],
  );

  const onCoSign = useCallback(async (): Promise<void> => {
    setSubmitError(null);
    setCoSignBlocked(false);
    const attempt = await runCoSignStep(coSign);
    if (attempt.outcome === "blocked") {
      // honest blocker — this wallet can never sign for the receiver
      setCoSignBlocked(true);
      return;
    }
    if (attempt.outcome === "failed") {
      setSubmitError(attempt.message);
      return;
    }
    setPhase("review");
  }, [coSign]);

  const onConfirm = useCallback(async (): Promise<void> => {
    if (!signature) return;
    setSubmitError(null);
    try {
      const txHash = await confirm(buildInput());
      handleTransferred(txHash);
      setOpen(false);
    } catch (err) {
      setSubmitError(humanizeError(err));
    }
  }, [buildInput, confirm, handleTransferred, setOpen, signature]);

  const onEdit = useCallback((): void => {
    reset();
    setSubmitError(null);
    setCoSignBlocked(false);
    setPhase("form");
  }, [reset]);

  // setState is stable — pass it straight to Field onChange (no wrapper needed).
  const cancel = useCallback((): void => {
    setOpen(false);
  }, [setOpen]);

  // One review-error shell for both error sources (submit-time and hook-level).
  const errorContent =
    submitError !== null ? (
      submitError
    ) : error !== null ? (
      <>
        {humanizeError(error)}
        {retryGuidance !== null && (
          <>
            <br />
            {retryGuidance}
          </>
        )}
      </>
    ) : null;
  const mergedError =
    errorContent !== null ? (
      <div className="review-error" role="alert" style={{ marginTop: 12 }}>
        <AlertTriangle size={14} />
        <div>{errorContent}</div>
      </div>
    ) : null;

  if (!open) return <></>;

  return (
    <ModalSheet
      title={flowCopy.transferAgentTitle(tokenId.toString())}
      closeLabel={flowCopy.closeTransferA11y}
      onClose={cancel}
    >
      <PhaseIndicator
        transferPhase={transferPhase}
        labels={flowCopy.transferPhases}
      />

      {phase === "form" ? (
        <TransferFormPhase
          formId={formId}
          receiverAddress={receiverAddress}
          onAddressChange={setReceiverAddress}
          addressError={addressError}
          receiverPubKey={receiverPubKey}
          onPubKeyChange={setReceiverPubKey}
          pubKeyError={pubKeyError}
          pubkeyFallback={pubkeyFallback}
          pubkeyResolveStatus={pubkeyResolveStatus}
          pubkeyFallbackSummary={flowCopy.transferPubkeyFallbackSummary}
          pubkeyResolvePending={flowCopy.transferPubkeyResolvePending}
          pubkeyResolveFailed={flowCopy.transferPubkeyResolveFailed}
          pubkeyResolveResolved={flowCopy.transferPubkeyResolveResolved}
          oldDataEncryptionKey={oldDataEncryptionKey}
          onOldDataKeyChange={setOldDataEncryptionKey}
          oldDataUri={oldDataUri}
          onOldDataUriChange={setOldDataUri}
          rekeyError={rekeyError}
          mergedError={mergedError}
          cancel={cancel}
          canSubmit={canSubmit}
          isLoading={isLoading}
          onSubmit={onSubmit}
          f={flowCopy}
        />
      ) : phase === "co-sign" && coSignReceiver !== null ? (
        <>
          <CoSignPhase
            receiver={coSignReceiver}
            blocked={coSignBlocked}
            isLoading={isLoading}
            copy={{
              title: flowCopy.coSignTitle,
              body: flowCopy.coSignBody(truncateAddress(coSignReceiver)),
              action: flowCopy.coSignAction,
              note: flowCopy.coSignNote,
              blockedTitle: flowCopy.coSignBlockedTitle,
              blockedBody: flowCopy.coSignBlockedBody(
                truncateAddress(coSignReceiver),
              ),
              recipientLabel: flowCopy.receiveReceiver,
              editLabel: flowCopy.edit,
            }}
            onSign={onCoSign}
            onEdit={onEdit}
          />
          {mergedError}
        </>
      ) : (
        <ConfirmTransferPhase
          signature={signature}
          mergedError={mergedError}
          isLoading={isLoading}
          onEdit={onEdit}
          onConfirm={onConfirm}
          f={flowCopy}
        />
      )}
    </ModalSheet>
  );
}
