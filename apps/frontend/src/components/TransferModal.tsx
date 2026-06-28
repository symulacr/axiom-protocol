import {
  useCallback,
  useId,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
} from 'react';
import { isAddress } from 'viem';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';
import { useTransfer, type TransferInput, type TransferPhase, type TransferResponse } from '../hooks/useTransfer.js';
import { COLORS, Button, Alert, MonoLabel, Input, Modal, Card, Spinner } from './ui.js';

const RECEIVER_PUBKEY_HEX_LENGTH = 130;



function freshNonceHex(byteLength = 32): `0x${string}` {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i] ?? 0;
    hex += byte.toString(16).padStart(2, '0');
  }
  return `0x${hex}` as `0x${string}`;
}

export type TransferModalProps = {
  tokenId: bigint;
  triggerLabel?: string;
  open?: boolean;
  onClose?: () => void;
  /** Called when the on-chain write resolves. Aliased as `onSuccess` for back-compat. */
  onTransferred?: (txHash: `0x${string}`) => void;
  onSuccess?: (txHash: `0x${string}`) => void;
};

function validatePubKey(value: string): string | null {
  if (value.length === 0) return 'required';
  if (!value.startsWith('0x')) return 'must be 0x-prefixed';
  if (value.length !== RECEIVER_PUBKEY_HEX_LENGTH) {
    return `must be ${RECEIVER_PUBKEY_HEX_LENGTH} chars (64 raw bytes, no 0x04 prefix)`;
  }
  return null;
}


function PhaseIndicator({ transferPhase }: { transferPhase: TransferPhase }): ReactElement {
  const phase = transferPhase;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-sm)', fontSize: 'var(--text-xs)', color: COLORS.textMuted }}>
      <Spinner size={12} />
      {phase === 'idle' ? 'Ready' :
       phase === 'challenge' ? 'Generating challenge...' :
       phase === 'signing' ? 'Waiting for signature...' :
       phase === 'finalizing' ? 'Re-encrypting data...' :
       phase === 'confirming' ? 'Confirming on-chain...' :
       phase}
    </span>
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
      <p className="text-muted text-sm" style={{ lineHeight: 1.6, fontWeight: 'var(--fw-light)', marginBottom: 20 }}>
        The receiver signs an EIP-712 AccessProof and the TEE oracle signs
        the OwnershipProof. You'll confirm the on-chain
        <code style={{ color: COLORS.bronzeLight }}> iTransferFrom </code>
        transaction in the next step.
      </p>

      <label htmlFor={`${formId}-to`} className="block mt-lg fw-medium text-sm text-primary">
        Receiver address
      </label>
      <Input
        id={`${formId}-to`}
        value={receiverAddress}
        onChange={onAddressChange}
        placeholder="0x\u2026"
        autoComplete="off"
        spellCheck={false}
        maxLength={42}
        className="w-full" style={{ boxSizing: 'border-box', fontFamily: 'var(--font-mono)', marginTop: 6 }}
        required
      />
      {addressError !== null && (
        <Alert variant="error" style={{ marginTop: 4 }}>{addressError}</Alert>
      )}

      <label htmlFor={`${formId}-pubkey`} className="block mt-lg fw-medium text-sm text-primary">
        Receiver Public Key
      </label>
      <textarea
        id={`${formId}-pubkey`}
        name="receiverPubKey64"
        value={receiverPubKey}
        onChange={onPubKeyChange}
        rows={3}
        spellCheck={false}
        maxLength={RECEIVER_PUBKEY_HEX_LENGTH}
        placeholder="0x\u2026  (128 hex chars)"
        style={{
          width: '100%',
          padding: '10px 14px',
          marginTop: 6,
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-sm)',
          border: `1px solid ${COLORS.borderStrong}`,
          borderRadius: 'var(--radius-md)',
          background: COLORS.bg,
          color: COLORS.text,
          boxSizing: 'border-box',
          resize: 'vertical',
        }}
        required
      />
      <p style={{ fontSize: 'var(--text-xs)', color: COLORS.textDim, margin: '4px 0 0' }}>
        The receiver's public key (not their address). Found in their wallet's 'Export Public Key' or via ENS. Must be 128 hex characters without the 0x04 prefix.
      </p>
      {pubKeyError !== null && (
        <Alert variant="error" style={{ marginTop: 4 }}>{pubKeyError}</Alert>
      )}

      <details style={{ fontSize: 'var(--text-xs)', color: COLORS.textDim }}>
        <summary style={{ cursor: 'pointer' }}>Advanced: Access proof details</summary>
        <label htmlFor={`${formId}-nonce`} className="block mt-sm fw-medium text-sm text-primary">
          Access proof nonce
        </label>
        <Input
          id={`${formId}-nonce`}
          value={accessProofNonce}
          readOnly
          className="w-full" style={{ boxSizing: 'border-box', fontFamily: 'var(--font-mono)', marginTop: 6, color: COLORS.bronzeLight }}
        />
        <p className="text-dim text-xs" style={{ margin: '4px 0 0', fontWeight: 'var(--fw-light)' }}>
          32 random bytes generated locally. A new nonce is minted each time the modal opens.
        </p>
      </details>

      <details className="mt-lg">
        <summary className="cursor-pointer text-sm fw-medium text-muted">
          Re-encrypt for receiver (optional re-key)
        </summary>
        <p className="text-dim text-xs" style={{ margin: '8px 0', fontWeight: 'var(--fw-light)' }}>
          Supply the current AES data key and 0G Storage URI to trigger a full
          re-key. The oracle re-encrypts and seals a fresh key. Leave blank for sign-only.
        </p>
        <label htmlFor={`${formId}-oldkey`} className="block mt-sm fw-medium text-sm text-primary">
          Old data encryption key (base64)
        </label>
        <Input
          id={`${formId}-oldkey`}
          value={oldDataEncryptionKey}
          onChange={onOldDataKeyChange}
          placeholder="base64 32-byte AES key"
          autoComplete="off"
          spellCheck={false}
          maxLength={256}
          className="w-full" style={{ boxSizing: 'border-box', fontFamily: 'var(--font-mono)', marginTop: 6 }}
        />
        <label htmlFor={`${formId}-olduri`} className="block mt-sm fw-medium text-sm text-primary">
          Old data URI (0x&hellip;)
        </label>
        <Input
          id={`${formId}-olduri`}
          value={oldDataUri}
          onChange={onOldDataUriChange}
          placeholder="0x\u2026 0G Storage root hash"
          autoComplete="off"
          spellCheck={false}
          maxLength={128}
          className="w-full" style={{ boxSizing: 'border-box', fontFamily: 'var(--font-mono)', marginTop: 6 }}
        />
        {rekeyError !== null && (
          <Alert variant="error" style={{ marginTop: 4 }}>{rekeyError}</Alert>
        )}
      </details>

      {mergedError}

      <div className="flex justify-end" style={{ gap: 10, marginTop: 20 }}>
        <Button variant="secondary" onClick={cancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={!canSubmit || rekeyError !== null}>
          {isLoading ? 'Signing\u2026' : 'Sign AccessProof'}
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
      <h2 id={`${formId}-title`} className="mt-0 text-xl fw-bold" style={{ color: COLORS.text, letterSpacing: '-0.02em' }}>
        Confirm Transfer
      </h2>

      <p className="text-muted text-sm" style={{ lineHeight: 1.6, fontWeight: 'var(--fw-light)', marginBottom: 20 }}>
        Review the proof details, then submit the on-chain
        <code style={{ color: COLORS.bronzeLight }}> iTransferFrom </code>
        transaction. Your wallet will ask for the final signature.
      </p>

      {signature !== null && signature.rekeyed === true && (
        <Alert variant="success" style={{ marginTop: 12 }}>
          <strong>Re-encrypted</strong> &mdash; agent data was re-keyed for the receiver.
          {signature.newDataHash !== undefined && (
            <>
              <br />
              New data hash: <MonoLabel style={{ fontSize: 'var(--text-xs)' }}>{signature.newDataHash}</MonoLabel>
            </>
          )}
        </Alert>
      )}

      {signature !== null && (
        <Card style={{ background: COLORS.bg, padding: '12px 16px', borderRadius: 'var(--radius-lg)', marginTop: 12, fontSize: 'var(--text-xs)', color: COLORS.textMuted }}>
          <strong style={{ color: COLORS.text }}>OwnershipProof</strong> (TEE-signed)
          <br />
          Signer: <MonoLabel style={{ fontSize: 'var(--text-xs)' }}>{signature.signer ?? '\u2014'}</MonoLabel>
          {signature.ownershipProof !== undefined && (
            <>
              <br />
              Valid until:{' '}
              <code style={{ color: COLORS.bronzeLight, fontSize: 'var(--text-xs)' }}>
                {new Date(Number(signature.ownershipProof.validUntil) * 1000).toISOString()}
              </code>
            </>
          )}
        </Card>
      )}

      {signature !== null && signature.accessSigner !== undefined && (
        <Card style={{ background: COLORS.bg, padding: '12px 16px', borderRadius: 'var(--radius-lg)', marginTop: 8, fontSize: 'var(--text-xs)', color: COLORS.textMuted }}>
          <strong style={{ color: COLORS.text }}>AccessProof</strong> (receiver-signed)
          <br />
          Recovered signer: <MonoLabel style={{ fontSize: 'var(--text-xs)' }}>{signature.accessSigner}</MonoLabel>
        </Card>
      )}

      {mergedError}


      <div className="flex justify-end" style={{ gap: 10, marginTop: 20 }}>
        <Button variant="secondary" onClick={onEdit} disabled={isLoading}>
          Edit
        </Button>
        <Button variant="primary" type="submit" disabled={isLoading || signature === null}>
          {isLoading ? 'Submitting\u2026' : 'Confirm on-chain transfer'}
        </Button>
      </div>
    </form>
  );
}


export function TransferModal({
  tokenId,
  triggerLabel,
  open: openProp,
  onClose,
  onTransferred,
  onSuccess,
}: TransferModalProps): ReactElement {
  const formId = useId();

  const { address: from, isConnected } = useAccount();
  const { prepare, confirm, isLoading, error, signature, reset, transferPhase } = useTransfer();

  const retryGuidance = useMemo<string | null>(() => {
    if (!error) return null;
    const msg = error.message.toLowerCase();

    if (transferPhase === 'challenge') {
      return 'The challenge request to the oracle failed. The nonce has been consumed — generate a new nonce and try again.';
    }
    if (transferPhase === 'signing') {
      return 'The wallet signature was rejected or failed. The nonce has been consumed — click "Edit" to restart from the beginning.';
    }
    if (transferPhase === 'finalizing') {
      return 'Finalization with the oracle failed. The transaction was NOT submitted. Generate a new nonce and restart.';
    }
    if (transferPhase === 'confirming') {
      return 'The on-chain transaction failed. Click "Edit" to restart the flow with a fresh nonce.';
    }

    if (msg.includes('challenge')) {
      return 'The challenge request failed. Generate a new nonce and try again.';
    }
    if (msg.includes('final') || msg.includes('proof struct')) {
      return 'Finalization failed. The transaction was NOT submitted. Click "Prepare Transfer" to restart.';
    }
    return 'Something went wrong. Click the appropriate button to restart from the beginning with a fresh nonce.';
  }, [error, transferPhase]);

  const [receiverAddress, setReceiverAddress] = useState('');
  const [receiverPubKey, setReceiverPubKey] = useState('');
  const [oldDataEncryptionKey, setOldDataEncryptionKey] = useState('');
  const [oldDataUri, setOldDataUri] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'form' | 'review'>('form');

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
      toast.success(`Transfer ${txHash.slice(0, 10)}... confirmed`);
      onTransferred?.(txHash);
      onSuccess?.(txHash);
    },
    [onSuccess, onTransferred],
  );

  const accessProofNonce = useMemo(
    () => freshNonceHex(32) as `0x${string}`,
    [],
  );

  const pubKeyError = useMemo(
    () => (receiverPubKey.length > 0 ? validatePubKey(receiverPubKey) : null),
    [receiverPubKey],
  );
  const addressError = useMemo(
    () =>
      receiverAddress.length > 0 && !isAddress(receiverAddress)
        ? 'not a valid EIP-55 address'
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
      return 'supply both old data key and old data URI to re-key, or leave both blank';
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
  }, [accessProofNonce, oldDataEncryptionKey, oldDataUri, receiverAddress, receiverPubKey, tokenId]);

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      if (!canSubmit || !from || rekeyError !== null) return;
      setSubmitError(null);
      try {
        await prepare(buildInput());
        setPhase('review');
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : String(err));
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
      setSubmitError(err instanceof Error ? err.message : String(err));
    }
  }, [buildInput, confirm, handleTransferred, setOpen, signature, tokenId, receiverAddress]);

  const onEdit = useCallback((): void => {
    reset();
    setSubmitError(null);
    setPhase('form');
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

  const openModal = useCallback((): void => {
    setSubmitError(null);
    reset();
    setPhase('form');
    setInternalOpen(true);
  }, [reset]);
  const cancel = useCallback((): void => {
    setOpen(false);
  }, [setOpen]);

  const mergedError =
    submitError !== null ? (
      <Alert variant="error" style={{ marginTop: 16 }}>
        {submitError}
      </Alert>
    ) : error !== null ? (
      <Alert variant="error" style={{ marginTop: 16 }}>
        {error.message}
        {retryGuidance !== null && (
          <>
            <br />
            <br />
            {retryGuidance}
          </>
        )}
      </Alert>
    ) : null;

  return (
    <>
      {triggerLabel !== undefined && triggerLabel !== '' && (
        <Button variant="primary" onClick={openModal} disabled={!isConnected}>
          {triggerLabel}
        </Button>
      )}

      <Modal
        open={open}
        onClose={cancel}
        title={`Transfer iNFT #${tokenId.toString()}`}
      >
        <PhaseIndicator transferPhase={transferPhase} />

        {phase === 'form' ? (
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

export default TransferModal;
