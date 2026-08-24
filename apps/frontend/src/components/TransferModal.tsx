import {
  useCallback,
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
  freshAccessProofNonce,
  runCoSignStep,
} from "../lib/cosignFlow.js";
import { useUiStore } from "../lib/uiStore.js";
import { getCopy } from "../lib/copy.js";

/**
 * TransferModal migrated off the v1 ui.tsx kit onto the Controls kit and
 * the shared overlay language — the sheet is the same graphite
 * operation-review layer as OperationReviewSheet (theme-invariant,
 * dismiss trio via useModalDismiss). Form semantics are unchanged; the title
 * reads copy.flowUi.transferAgentTitle ("Transfer agent #N" — the "iNFT"
 * wording is gone). Remaining chrome stays English per the documented
 * flow-body i18n deferral (chat-path exception; the co-sign step and the
 * title localize through copy.ts).
 */

const RECEIVER_PUBKEY_HEX_LENGTH = 130;

const PHASE_LABELS: Record<TransferPhase, string> = {
  idle: "Ready",
  challenge: "Generating challenge…",
  signing: "Waiting for signature…",
  finalizing: "Securing data for the receiver…",
  confirming: "Confirming on-chain…",
};

const PHASE_RETRY: Partial<Record<TransferPhase, string>> = {
  challenge: "Failed. Tap Edit to retry with a fresh nonce.",
  signing: "Failed. Tap Edit to retry with a fresh nonce.",
  finalizing: "Failed. Tap Edit to retry with a fresh nonce.",
  confirming: "Failed. Tap Edit to retry with a fresh nonce.",
};

type TransferModalProps = {
  tokenId: bigint;
  open?: boolean;
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

/** Shared modal shell: the app's overlay layer (graphite, theme-invariant)
 * with the dismiss trio — replaces the v1 <dialog> from ui.tsx. */
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
  accessProofNonce,
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
  accessProofNonce: `0x${string}`;
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
        required
        error={pubKeyError ?? undefined}
        hint="From the receiver's wallet → Export Public Key."
      />

      <Field
        id={`${formId}-nonce`}
        label="Access proof nonce"
        value={accessProofNonce}
        readOnly
        mono
        hint="Unique per transfer; generated automatically."
      />

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
  open: openProp,
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
    const msg = error.message.toLowerCase();

    const phaseHint = PHASE_RETRY[transferPhase];
    if (phaseHint !== undefined) return phaseHint;

    if (msg.includes("challenge")) {
      return "The challenge request failed. Generate a new nonce and try again.";
    }
    if (msg.includes("final") || msg.includes("proof struct")) {
      return 'Finalization failed. The transaction was NOT submitted. Click "Prepare Transfer" to restart.';
    }
    return "Something went wrong. Click the appropriate button to restart from the beginning with a fresh nonce.";
  }, [error, transferPhase]);

  const [receiverAddress, setReceiverAddress] = useState("");
  const [receiverPubKey, setReceiverPubKey] = useState("");
  const [oldDataEncryptionKey, setOldDataEncryptionKey] = useState("");
  const [oldDataUri, setOldDataUri] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "co-sign" | "review">("form");
  const [coSignBlocked, setCoSignBlocked] = useState(false);

  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? openProp : internalOpen;
  const setOpen = useCallback(
    (next: boolean): void => {
      if (!isControlled) setInternalOpen(next);
      if (!next) onClose?.();
    },
    [isControlled, onClose],
  );
  const handleTransferred = useCallback(
    (txHash: `0x${string}`): void => {
      toast.success(`Transfer ${txHash.slice(0, 10)}… confirmed`);
      onSuccess?.(txHash);
    },
    [onSuccess],
  );

  const [accessProofNonce, setAccessProofNonce] = useState<`0x${string}`>(
    freshAccessProofNonce,
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
    return assembleTransferInput(
      {
        tokenId,
        to: receiverAddress,
        receiverPubKey64: receiverPubKey,
        accessProofNonce,
      },
      { oldDataEncryptionKey, oldDataUri },
    );
  }, [
    accessProofNonce,
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
    setAccessProofNonce(freshAccessProofNonce());
  }, [reset]);

  // setState is stable — pass it straight to Field onChange (no wrapper needed).
  const cancel = useCallback((): void => {
    setOpen(false);
  }, [setOpen]);

  const mergedError =
    submitError !== null ? (
      <div className="review-error" role="alert" style={{ marginTop: 12 }}>
        <AlertTriangle size={14} />
        <div>{submitError}</div>
      </div>
    ) : error !== null ? (
      <div className="review-error" role="alert" style={{ marginTop: 12 }}>
        <AlertTriangle size={14} />
        <div>
          {humanizeError(error)}
          {retryGuidance !== null && (
            <>
              <br />
              {retryGuidance}
            </>
          )}
        </div>
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
          accessProofNonce={accessProofNonce}
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
