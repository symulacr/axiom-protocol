import {
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { isAddress, toHex } from "viem";
import { toast } from "sonner";
import { useAccount } from "wagmi";
import {
  useTransfer,
  type TransferInput,
  type TransferPhase,
  type TransferResponse,
} from "../hooks/useTransfer.js";
import {
  COLORS,
  Button,
  Alert,
  MonoLabel,
  ErrorRef,
  Input,
  Textarea,
  Modal,
  Card,
  Spinner,
} from "./ui.js";
import { humanizeError } from "../utils/format.js";

const RECEIVER_PUBKEY_HEX_LENGTH = 130;

const monoFieldStyle: CSSProperties = {
  boxSizing: "border-box",
  fontFamily: "var(--font-mono)",
  marginTop: 6,
};

const confirmTextStyle: CSSProperties = {
  lineHeight: 1.6,
  fontWeight: "var(--fw-light)",
  marginBottom: 20,
};

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

const proofCardStyle: CSSProperties = {
  background: COLORS.bg,
  padding: "12px 16px",
  borderRadius: "var(--radius-lg)",
  fontSize: "var(--text-xs)",
  color: COLORS.textMuted,
};

function freshNonceHex(byteLength = 32): `0x${string}` {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

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

function PhaseIndicator({
  transferPhase,
}: {
  transferPhase: TransferPhase;
}): ReactElement {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-sm)",
        fontSize: "var(--text-xs)",
        color: COLORS.textMuted,
      }}
    >
      <Spinner size={12} />
      {PHASE_LABELS[transferPhase] ?? transferPhase}
    </span>
  );
}

function FieldLabel({
  htmlFor,
  children,
  spacing = "lg",
}: {
  htmlFor: string;
  children: ReactNode;
  spacing?: "lg" | "sm";
}): ReactElement {
  return (
    <label
      htmlFor={htmlFor}
      className={`block mt-${spacing} fw-medium text-sm text-primary`}
    >
      {children}
    </label>
  );
}

function FieldError({
  children,
}: {
  children: ReactNode;
}): ReactElement | null {
  return children === null ? null : (
    <Alert variant="error" style={{ marginTop: 4 }}>
      {children}
    </Alert>
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
  onAddressChange: (e: ChangeEvent<HTMLInputElement>) => void;
  addressError: string | null;
  receiverPubKey: string;
  onPubKeyChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  pubKeyError: string | null;
  accessProofNonce: `0x${string}`;
  oldDataEncryptionKey: string;
  onOldDataKeyChange: (e: ChangeEvent<HTMLInputElement>) => void;
  oldDataUri: string;
  onOldDataUriChange: (e: ChangeEvent<HTMLInputElement>) => void;
  rekeyError: string | null;
  mergedError: ReactElement | null;
  cancel: () => void;
  canSubmit: boolean;
  isLoading: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => Promise<void>;
}): ReactElement {
  return (
    <form onSubmit={onSubmit}>
      <p className="text-muted text-sm" style={confirmTextStyle}>
        You'll sign once to authorize, then confirm the on-chain transfer.
      </p>

      <FieldLabel htmlFor={`${formId}-to`}>Receiver address</FieldLabel>
      <Input
        id={`${formId}-to`}
        value={receiverAddress}
        onChange={onAddressChange}
        placeholder="0x\u2026"
        autoComplete="off"
        spellCheck={false}
        maxLength={42}
        className="w-full"
        style={monoFieldStyle}
        required
      />
      <FieldError>{addressError}</FieldError>

      <FieldLabel htmlFor={`${formId}-pubkey`} spacing="sm">
        Receiver public key
      </FieldLabel>
      <Textarea
        id={`${formId}-pubkey`}
        name="receiverPubKey64"
        value={receiverPubKey}
        onChange={onPubKeyChange}
        rows={3}
        spellCheck={false}
        maxLength={RECEIVER_PUBKEY_HEX_LENGTH}
        placeholder="0x\u2026  (128 hex chars)"
        className="w-full"
        style={monoFieldStyle}
        required
      />
      <p
        style={{
          fontSize: "var(--text-xs)",
          color: COLORS.textDim,
          margin: "4px 0 0",
        }}
      >
        128 hex chars, no 0x04 prefix. Get it from the receiver's wallet 'Export
        Public Key'.
      </p>
      <FieldError>{pubKeyError}</FieldError>

      <FieldLabel htmlFor={`${formId}-nonce`} spacing="sm">
        Access proof nonce
      </FieldLabel>
      <Input
        id={`${formId}-nonce`}
        value={accessProofNonce}
        readOnly
        className="w-full"
        style={{ ...monoFieldStyle, color: COLORS.bronzeLight }}
      />
      <p
        className="text-dim text-xs"
        style={{ margin: "4px 0 0", fontWeight: "var(--fw-light)" }}
      >
        Unique per transfer; generated automatically.
      </p>

      <details className="mt-lg">
        <summary className="cursor-pointer text-sm fw-medium text-muted">
          Re-encrypt for receiver (optional)
        </summary>
        <p
          className="text-dim text-xs"
          style={{ margin: "8px 0", fontWeight: "var(--fw-light)" }}
        >
          Optional: AES key + storage URI so only the receiver can read the data
          after the transfer. Blank = sign-only.
        </p>
        <FieldLabel htmlFor={`${formId}-oldkey`} spacing="sm">
          Old data encryption key (base64)
        </FieldLabel>
        <Input
          id={`${formId}-oldkey`}
          value={oldDataEncryptionKey}
          onChange={onOldDataKeyChange}
          placeholder="base64 32-byte AES key"
          autoComplete="off"
          spellCheck={false}
          maxLength={256}
          className="w-full"
          style={monoFieldStyle}
        />
        <FieldLabel htmlFor={`${formId}-olduri`} spacing="sm">
          Old data URI (0x&hellip;)
        </FieldLabel>
        <Input
          id={`${formId}-olduri`}
          value={oldDataUri}
          onChange={onOldDataUriChange}
          placeholder="0x\u2026 0G Storage root hash"
          autoComplete="off"
          spellCheck={false}
          maxLength={128}
          className="w-full"
          style={monoFieldStyle}
        />
        <FieldError>{rekeyError}</FieldError>
      </details>

      {mergedError}

      <div className="flex justify-end" style={{ gap: 10, marginTop: 20 }}>
        <Button variant="secondary" onClick={cancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          variant="primary"
          type="submit"
          disabled={!canSubmit || rekeyError !== null}
        >
          {isLoading ? "Signing\u2026" : "Sign transfer authorization"}
        </Button>
      </div>
    </form>
  );
}

function ConfirmTransferPhase({
  formId,
  signature,
  mergedError,
  isLoading,
  onEdit,
  onConfirm,
}: {
  formId: string;
  signature: TransferResponse | null;
  mergedError: ReactElement | null;
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
      <h2
        id={`${formId}-title`}
        className="mt-0 text-xl fw-bold"
        style={{ color: COLORS.text, letterSpacing: "-0.02em" }}
      >
        Confirm Transfer
      </h2>

      <p className="text-muted text-sm" style={confirmTextStyle}>
        Confirm — your wallet will ask for the final signature.
      </p>

      {signature !== null && signature.rekeyed === true && (
        <Alert variant="success" style={{ marginTop: 12 }}>
          <strong>Transfer authorized</strong> &mdash; the agent&rsquo;s data
          was re-encrypted so only the new owner can read it.
          {signature.newDataHash !== undefined && (
            <details style={{ marginTop: 8 }}>
              <summary className="cursor-pointer text-xs">
                Proof details
              </summary>
              New data hash:{" "}
              <MonoLabel
                copyable
                text={signature.newDataHash}
                style={{ fontSize: "var(--text-xs)" }}
              >
                {signature.newDataHash}
              </MonoLabel>
              {signature.ownershipProof?.sealedKey !== undefined && (
                <>
                  <br />
                  New sealed key:{" "}
                  <MonoLabel
                    copyable
                    text={signature.ownershipProof.sealedKey}
                    style={{ fontSize: "var(--text-xs)" }}
                  >
                    {signature.ownershipProof.sealedKey}
                  </MonoLabel>
                </>
              )}
            </details>
          )}
        </Alert>
      )}

      {signature !== null && (
        <Card style={{ ...proofCardStyle, marginTop: 12 }}>
          <strong style={{ color: COLORS.text }}>OwnershipProof</strong> (signed
          by the Axiom oracle)
          <br />
          Signer:{" "}
          <MonoLabel
            copyable
            text={signature.signer ?? ""}
            style={{ fontSize: "var(--text-xs)" }}
          >
            {signature.signer ?? "\u2014"}
          </MonoLabel>
          {signature.ownershipProof !== undefined && (
            <>
              <br />
              Valid until:{" "}
              <code
                style={{
                  color: COLORS.bronzeLight,
                  fontSize: "var(--text-xs)",
                }}
              >
                {new Date(
                  Number(signature.ownershipProof.validUntil) * 1000,
                ).toISOString()}
              </code>
            </>
          )}
        </Card>
      )}

      {signature !== null && signature.accessSigner !== undefined && (
        <Card style={{ ...proofCardStyle, marginTop: 8 }}>
          <strong style={{ color: COLORS.text }}>AccessProof</strong>{" "}
          (receiver-signed)
          <br />
          Recovered signer:{" "}
          <MonoLabel
            copyable
            text={signature.accessSigner}
            style={{ fontSize: "var(--text-xs)" }}
          >
            {signature.accessSigner}
          </MonoLabel>
        </Card>
      )}

      {mergedError}

      <div className="flex justify-end" style={{ gap: 10, marginTop: 20 }}>
        <Button variant="secondary" onClick={onEdit} disabled={isLoading}>
          Edit
        </Button>
        <Button
          variant="primary"
          type="submit"
          disabled={isLoading || signature === null}
        >
          {isLoading ? "Submitting\u2026" : "Confirm on-chain transfer"}
        </Button>
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
    confirm,
    isLoading,
    error,
    signature,
    reset,
    transferPhase,
  } = useTransfer();

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
  const [phase, setPhase] = useState<"form" | "review">("form");

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
    () => freshNonceHex(32) as `0x${string}`,
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
    const input: TransferInput = {
      tokenId,
      to: receiverAddress as `0x${string}`,
      receiverPubKey64: receiverPubKey as `0x${string}`,
      accessProofNonce,
    };
    if (oldDataEncryptionKey && oldDataUri) {
      input.oldDataEncryptionKey = oldDataEncryptionKey;
      input.oldDataUri = oldDataUri as `0x${string}`;
    }
    return input;
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
      try {
        await prepare(buildInput());
        setPhase("review");
      } catch (err) {
        setSubmitError(humanizeError(err));
      }
    },
    [buildInput, canSubmit, from, prepare, rekeyError],
  );

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
  }, [
    buildInput,
    confirm,
    handleTransferred,
    setOpen,
    signature,
    tokenId,
    receiverAddress,
  ]);

  const onEdit = useCallback((): void => {
    reset();
    setSubmitError(null);
    setPhase("form");
    setAccessProofNonce(freshNonceHex(32) as `0x${string}`);
  }, [reset]);

  const onAddressChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      setReceiverAddress(event.target.value);
    },
    [],
  );
  const onPubKeyChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>): void => {
      setReceiverPubKey(event.target.value);
    },
    [],
  );
  const onOldDataKeyChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      setOldDataEncryptionKey(event.target.value);
    },
    [],
  );
  const onOldDataUriChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      setOldDataUri(event.target.value);
    },
    [],
  );

  const cancel = useCallback((): void => {
    setOpen(false);
  }, [setOpen]);

  const errObj = error as { code?: string; requestId?: string } | null;
  const mergedError =
    submitError !== null ? (
      <Alert variant="error" style={{ marginTop: 16 }}>
        {submitError}
      </Alert>
    ) : error !== null ? (
      <Alert variant="error" style={{ marginTop: 16 }}>
        {humanizeError(error)}
        {retryGuidance !== null && (
          <>
            <br />
            <br />
            {retryGuidance}
          </>
        )}
        {errObj?.code !== undefined || errObj?.requestId !== undefined ? (
          <ErrorRef code={errObj?.code} requestId={errObj?.requestId} />
        ) : null}
      </Alert>
    ) : null;

  return (
    <>
      <Modal
        open={open}
        onClose={cancel}
        title={`Transfer iNFT #${tokenId.toString()}`}
        style={{ viewTransitionName: "transfer-dialog" }}
      >
        <PhaseIndicator transferPhase={transferPhase} />

        {phase === "form" ? (
          <TransferFormPhase
            formId={formId}
            receiverAddress={receiverAddress}
            onAddressChange={onAddressChange}
            addressError={addressError}
            receiverPubKey={receiverPubKey}
            onPubKeyChange={onPubKeyChange}
            pubKeyError={pubKeyError}
            accessProofNonce={accessProofNonce}
            oldDataEncryptionKey={oldDataEncryptionKey}
            onOldDataKeyChange={onOldDataKeyChange}
            oldDataUri={oldDataUri}
            onOldDataUriChange={onOldDataUriChange}
            rekeyError={rekeyError}
            mergedError={mergedError}
            cancel={cancel}
            canSubmit={canSubmit}
            isLoading={isLoading}
            onSubmit={onSubmit}
          />
        ) : (
          <ConfirmTransferPhase
            formId={formId}
            signature={signature}
            mergedError={mergedError}
            isLoading={isLoading}
            onEdit={onEdit}
            onConfirm={onConfirm}
          />
        )}
      </Modal>
    </>
  );
}
