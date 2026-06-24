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
import { useAccount } from 'wagmi';
import { useTransfer, type TransferInput } from '../hooks/useTransfer.js';
import { COLORS, Button, Alert, MonoLabel, Input, Modal, Card } from './ui.js';

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

  const PHASE_LABELS: Record<string, string> = {
    idle: 'Prepare Transfer',
    challenge: 'Challenge',
    signing: 'Sign in Wallet',
    finalizing: 'Finalize',
    confirming: 'Confirm on-chain',
  };

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
  }, [buildInput, confirm, handleTransferred, setOpen, signature]);

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
        {/* Phase indicator */}
        <div
          style={{
            marginBottom: 16,
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          {(['idle', 'challenge', 'signing', 'finalizing', 'confirming'] as const).map((p, i, arr) => (
            <span
              key={p}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                color:
                  transferPhase === p
                    ? COLORS.bronzeLight
                    : arr.indexOf(transferPhase) > i
                      ? COLORS.textMuted
                      : COLORS.textDim,
              }}
            >
              {i > 0 && (
                <span style={{ color: COLORS.textDim, fontSize: 10 }}>→</span>
              )}
              <span
                style={{
                  background:
                    transferPhase === p
                      ? 'rgba(191, 144, 86, 0.12)'
                      : 'transparent',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontWeight: transferPhase === p ? 600 : 400,
                }}
              >
                {PHASE_LABELS[p]}
              </span>
            </span>
          ))}
        </div>

        {phase === 'form' ? (
          <form onSubmit={onSubmit}>

            <p style={{ color: COLORS.textMuted, fontSize: 13, lineHeight: 1.6, fontWeight: 300, marginBottom: 20 }}>
              The receiver signs an EIP-712 AccessProof and the TEE oracle signs
              the OwnershipProof. You'll confirm the on-chain
              <code style={{ color: COLORS.bronzeLight }}> iTransferFrom </code>
              transaction in the next step.
            </p>

            <label htmlFor={`${formId}-to`} style={{ display: 'block', marginTop: 16, fontWeight: 500, fontSize: 13, color: COLORS.textPrimary }}>
              Receiver address
            </label>
            <Input
              id={`${formId}-to`}
              value={receiverAddress}
              onChange={onAddressChange}
              placeholder="0x…"
              autoComplete="off"
              spellCheck={false}
              style={{ width: '100%', boxSizing: 'border-box', fontFamily: "'SF Mono', monospace", marginTop: 6 }}
              required
            />
            {addressError !== null && (
              <Alert variant="error" style={{ marginTop: 4 }}>{addressError}</Alert>
            )}

            <label htmlFor={`${formId}-pubkey`} style={{ display: 'block', marginTop: 16, fontWeight: 500, fontSize: 13, color: COLORS.textPrimary }}>
              Receiver pubkey (64 raw bytes, no 0x04 prefix)
            </label>
            <textarea
              id={`${formId}-pubkey`}
              name="receiverPubKey64"
              value={receiverPubKey}
              onChange={onPubKeyChange}
              rows={3}
              spellCheck={false}
              placeholder="0x…  (128 hex chars)"
              style={{
                width: '100%',
                padding: '10px 14px',
                marginTop: 6,
                fontFamily: "'SF Mono', monospace",
                fontSize: 13,
                border: `1px solid ${COLORS.borderStrong}`,
                borderRadius: 6,
                background: COLORS.bg,
                color: COLORS.text,
                boxSizing: 'border-box',
                resize: 'vertical',
                outline: 'none',
              }}
              required
            />
            {pubKeyError !== null && (
              <Alert variant="error" style={{ marginTop: 4 }}>{pubKeyError}</Alert>
            )}

            <label htmlFor={`${formId}-nonce`} style={{ display: 'block', marginTop: 16, fontWeight: 500, fontSize: 13, color: COLORS.textPrimary }}>
              Access proof nonce
            </label>
            <Input
              id={`${formId}-nonce`}
              value={accessProofNonce}
              readOnly
              style={{ width: '100%', boxSizing: 'border-box', fontFamily: "'SF Mono', monospace", marginTop: 6, color: COLORS.bronzeLight }}
            />
            <p style={{ color: COLORS.textDim, fontSize: 11, margin: '4px 0 0', fontWeight: 300 }}>
              32 random bytes generated locally. A new nonce is minted each time the modal opens.
            </p>

            <details style={{ marginTop: 16 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 500, color: COLORS.textMuted }}>
                Re-encrypt for receiver (optional re-key)
              </summary>
              <p style={{ color: COLORS.textDim, fontSize: 11, margin: '8px 0', fontWeight: 300 }}>
                Supply the current AES data key and 0G Storage URI to trigger a full
                re-key. The oracle re-encrypts and seals a fresh key. Leave blank for sign-only.
              </p>
              <label htmlFor={`${formId}-oldkey`} style={{ display: 'block', marginTop: 8, fontWeight: 500, fontSize: 13, color: COLORS.textPrimary }}>
                Old data encryption key (base64)
              </label>
              <Input
                id={`${formId}-oldkey`}
                value={oldDataEncryptionKey}
                onChange={onOldDataKeyChange}
                placeholder="base64 32-byte AES key"
                autoComplete="off"
                spellCheck={false}
                style={{ width: '100%', boxSizing: 'border-box', fontFamily: "'SF Mono', monospace", marginTop: 6 }}
              />
              <label htmlFor={`${formId}-olduri`} style={{ display: 'block', marginTop: 8, fontWeight: 500, fontSize: 13, color: COLORS.textPrimary }}>
                Old data URI (0x…)
              </label>
              <Input
                id={`${formId}-olduri`}
                value={oldDataUri}
                onChange={onOldDataUriChange}
                placeholder="0x… 0G Storage root hash"
                autoComplete="off"
                spellCheck={false}
                style={{ width: '100%', boxSizing: 'border-box', fontFamily: "'SF Mono', monospace", marginTop: 6 }}
              />
              {rekeyError !== null && (
                <Alert variant="error" style={{ marginTop: 4 }}>{rekeyError}</Alert>
              )}
            </details>

            {error !== null && (
              <Alert variant="error" style={{ marginTop: 16 }}>
                {error.message}
              </Alert>
            )}
            {retryGuidance !== null && (
              <Alert variant="warning" style={{ marginTop: 8 }}>
                {retryGuidance}
              </Alert>
            )}
            {submitError !== null && (
              <Alert variant="error" style={{ marginTop: 12 }}>
                {submitError}
              </Alert>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <Button variant="secondary" onClick={cancel} disabled={isLoading}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={!canSubmit || rekeyError !== null}>
                {isLoading ? 'Signing…' : 'Sign AccessProof'}
              </Button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={(e): void => {
              e.preventDefault();
              void onConfirm();
            }}
          >
            <h2 id={`${formId}-title`} style={{ marginTop: 0, fontSize: 22, fontWeight: 700, color: COLORS.text, letterSpacing: '-0.02em' }}>
              Confirm Transfer
            </h2>

            <p style={{ color: COLORS.textMuted, fontSize: 13, lineHeight: 1.6, fontWeight: 300, marginBottom: 20 }}>
              Review the proof details, then submit the on-chain
              <code style={{ color: COLORS.bronzeLight }}> iTransferFrom </code>
              transaction. Your wallet will ask for the final signature.
            </p>

            {signature !== null && signature.rekeyed === true && (
              <Alert variant="success" style={{ marginTop: 12 }}>
                <strong>Re-encrypted</strong> — agent data was re-keyed for the receiver.
                {signature.newDataHash !== undefined && (
                  <>
                    <br />
                    New data hash: <MonoLabel style={{ fontSize: 11 }}>{signature.newDataHash}</MonoLabel>
                  </>
                )}
              </Alert>
            )}

            {signature !== null && (
              <Card style={{ background: COLORS.bg, padding: '12px 16px', borderRadius: 8, marginTop: 12, fontSize: 12, color: COLORS.textMuted }}>
                <strong style={{ color: COLORS.text }}>OwnershipProof</strong> (TEE-signed)
                <br />
                Signer: <MonoLabel style={{ fontSize: 11 }}>{signature.signer ?? '—'}</MonoLabel>
                {signature.ownershipProof !== undefined && (
                  <>
                    <br />
                    Valid until:{' '}
                    <code style={{ color: COLORS.bronzeLight, fontSize: 11 }}>
                      {new Date(Number(signature.ownershipProof.validUntil) * 1000).toISOString()}
                    </code>
                  </>
                )}
              </Card>
            )}

            {signature !== null && signature.accessSigner !== undefined && (
              <Card style={{ background: COLORS.bg, padding: '12px 16px', borderRadius: 8, marginTop: 8, fontSize: 12, color: COLORS.textMuted }}>
                <strong style={{ color: COLORS.text }}>AccessProof</strong> (receiver-signed)
                <br />
                Recovered signer: <MonoLabel style={{ fontSize: 11 }}>{signature.accessSigner}</MonoLabel>
              </Card>
            )}

            {error !== null && (
              <Alert variant="error" style={{ marginTop: 16 }}>
                {error.message}
              </Alert>
            )}
            {retryGuidance !== null && (
              <Alert variant="warning" style={{ marginTop: 8 }}>
                {retryGuidance}
              </Alert>
            )}
            {submitError !== null && (
              <Alert variant="error" style={{ marginTop: 12 }}>
                {submitError}
              </Alert>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <Button variant="secondary" onClick={onEdit} disabled={isLoading}>
                Edit
              </Button>
              <Button variant="primary" type="submit" disabled={isLoading || signature === null}>
                {isLoading ? 'Submitting…' : 'Confirm on-chain transfer'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

export default TransferModal;
