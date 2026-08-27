import {
  useCallback,
  useEffect,
  useId,
  useMemo,
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

/*
  Shared overlay shell + Controls kit; title/co-sign localize via
  copy.flowUi; body English per flow-body i18n deferral.
*/

const RECEIVER_PUBKEY_HEX_LENGTH = 130;

const PHASE_LABELS: Record<TransferPhase, string> = {
  idle: "Ready",
  challenge: "Preparing transfer…",
  signing: "Waiting for signature…",
  finalizing: "Securing data for the receiver…",
  confirming: "Confirming on-chain…",
};

/** Every failed phase retries identically: Edit regenerates a fresh nonce
 * (single-use). Only the idle phase has no retry hint to offer. */
const RETRY_HINT = "Failed. Tap Edit to retry.";

type TransferModalProps = {
  tokenId: bigint;
  open: boolean;
  onClose?: () => void;
  onSuccess?: (txHash: `0x${string}`) => void;
};

function validatePubKey(value: string): string | null {
  if (value.length === 0) return "required";
  if (!value.startsWith("0x")) return "must be 0x-prefixed";
  if (value.length !== RECEIVER_PUBKEY_HEX_LENGTH) {
    return `must be ${RECEIVER_PUBKEY_HEX_LENGTH} chars (64 raw bytes, no 0x04 prefix)`;
  }
  return null;
}

/** Shared modal shell: the app's overlay layer with the dismiss trio via useModalDismiss. */
function ModalSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}): ReactElement {
  const titleId = useId();
  useModalDismiss(onClose);
  return createPortal(
    <div
      className="operation-review-layer"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="operation-review-sheet transfer-modal-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="operation-review-head">
          <div>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
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
}: {
  transferPhase: TransferPhase;
}): ReactElement {
  return (
    <Status
      label={PHASE_LABELS[transferPhase] ?? transferPhase}
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
  pubkeyResolveStatus: "idle" | "pending" | "failed";
  pubkeyFallbackSummary: string;
  pubkeyResolvePending: string;
  pubkeyResolveFailed: string;
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
}): ReactElement {
  return (
    <form onSubmit={onSubmit}>
      <p className="transfer-modal-lede">
        You'll sign once to authorize, then confirm the on-chain transfer.
      </p>

      <Field
        id={`${formId}-to`}
        label="Receiver address"
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
              label="Receiver public key"
              value={receiverPubKey}
              onChange={onPubKeyChange}
              placeholder="0x…  (128 hex chars)"
              maxLength={RECEIVER_PUBKEY_HEX_LENGTH}
              multiline
              rows={3}
              mono
              error={pubKeyError ?? undefined}
            />
          </details>
        </>
      ) : (
        pubkeyResolveStatus === "pending" && (
          <p className="transfer-modal-lede">{pubkeyResolvePending}</p>
        )
      )}

      <details className="transfer-modal-details">
        <summary>Re-encrypt for receiver (optional)</summary>
        <p className="transfer-modal-lede">
          Optional: AES key + storage URI so only the receiver can read the data
          after the transfer. Blank = sign-only.
        </p>
        <Field
          id={`${formId}-oldkey`}
          label="Old data encryption key (base64)"
          value={oldDataEncryptionKey}
          onChange={onOldDataKeyChange}
          placeholder="base64 32-byte AES key"
          maxLength={256}
          mono
        />
        <Field
          id={`${formId}-olduri`}
          label="Old data URI (0x…)"
          value={oldDataUri}
          onChange={onOldDataUriChange}
          placeholder="0x… storage root hash"
          maxLength={128}
          mono
          error={rekeyError ?? undefined}
        />
      </details>

      {mergedError}

      <div className="review-actions">
        <Button variant="ghost" onClick={cancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!canSubmit || rekeyError !== null}
          busy={isLoading}
          icon={<ShieldCheck size={15} />}
        >
          {isLoading ? "Signing…" : "Sign transfer authorization"}
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
}: {
  signature: TransferResponse | null;
  mergedError: ReactNode;
  isLoading: boolean;
  onEdit: () => void;
  onConfirm: () => Promise<void>;
}): ReactElement {
  return (
    <form
      onSubmit={(e): void => {
        e.preventDefault();
        void onConfirm();
      }}
    >
      <p className="transfer-modal-lede">
        Confirm — your wallet will ask for the final signature.
      </p>

      {signature !== null && signature.rekeyed === true && (
        <div className="review-proof">
          <Check size={14} />
          <span>
            <strong>Transfer authorized</strong> — the agent's data was
            re-encrypted so only the new owner can read it.
            {signature.newDataHash !== undefined && (
              <details>
                <summary>Proof details</summary>
                New metadata hash:{" "}
                <span className="mono">{signature.newDataHash}</span>
                {signature.ownershipProof?.sealedKey !== undefined && (
                  <>
                    {" "}
                    · new sealed key:{" "}
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
            <dt>Ownership proof</dt>
            <dd className="mono">{signature.signer ?? "—"}</dd>
          </div>
          {signature.ownershipProof !== undefined && (
            <div>
              <dt>Valid until</dt>
              <dd className="mono">
                {new Date(
                  Number(signature.ownershipProof.validUntil) * 1000,
                ).toISOString()}
              </dd>
            </div>
          )}
          {signature.accessSigner !== undefined && (
            <div>
              <dt>Accepted by</dt>
              <dd className="mono">{signature.accessSigner}</dd>
            </div>
          )}
        </dl>
      )}

      {mergedError}

      <div className="review-actions">
        <Button variant="ghost" onClick={onEdit} disabled={isLoading}>
          Edit
        </Button>
        <Button
          type="submit"
          disabled={isLoading || signature === null}
          busy={isLoading}
          icon={<ShieldCheck size={15} />}
        >
          {isLoading ? "Submitting…" : "Confirm on-chain transfer"}
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
          <dt>Receiver</dt>
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
          Edit
        </Button>
        {!blocked && (
          <Button
            type="submit"
            disabled={isLoading}
            busy={isLoading}
            icon={<ShieldCheck size={15} />}
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

    if (transferPhase !== "idle") return RETRY_HINT;

    const msg = error.message.toLowerCase();
    if (msg.includes("challenge")) {
      return "The request failed. Please try again.";
    }
    if (msg.includes("final") || msg.includes("proof struct")) {
      return "Submission failed. Nothing was sent. Tap Edit to retry.";
    }
    return "Something went wrong. Tap Edit to start over.";
  }, [error, transferPhase]);

  const [receiverAddress, setReceiverAddress] = useState("");
  const [receiverPubKey, setReceiverPubKey] = useState("");
  // P3 §(b)#4: when the address resolves to NO_ONCHAIN_KEY the Advanced paste
  // field (spec-mandated fallback) is revealed; reset whenever the address changes.
  const [pubkeyFallback, setPubkeyFallback] = useState(false);
  const [pubkeyResolveStatus, setPubkeyResolveStatus] = useState<
    "idle" | "pending" | "failed"
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
        if (!cancelled) setPubkeyResolveStatus("idle");
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
      toast.success(`Transfer ${txHash.slice(0, 10)}… confirmed`);
      onSuccess?.(txHash);
    },
    [onSuccess],
  );

  const pubKeyError = useMemo(
    () => (receiverPubKey.length > 0 ? validatePubKey(receiverPubKey) : null),
    [receiverPubKey],
  );
  const addressError = useMemo(
    () =>
      receiverAddress.length > 0 && !isAddress(receiverAddress)
        ? "not a valid EIP-55 address"
        : null,
    [receiverAddress],
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
      return "supply both old data key and old data URI to re-encrypt, or leave both blank";
    }
    return null;
  }, [oldDataEncryptionKey, oldDataUri]);
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
      onClose={cancel}
    >
      <PhaseIndicator transferPhase={transferPhase} />

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
        />
      )}
    </ModalSheet>
  );
}
