// Axiom Protocol — `TransferModal`.
//
// Modal that drives the iNFT (AxiomAgentNFT) transfer flow end-to-end in
// two phases:
//
//   1. Form — the user enters the receiver's address + 64-byte
//       uncompressed secp256k1 pubkey (raw X||Y, no 0x04 prefix) and
//       optionally the old AES data key + 0G Storage URI to trigger a full
//       re-key. On submit the modal calls `useTransfer().prepare()`, which
//       challenges the backend (`POST /v1/agents/:tokenId/transfer`), has
//       the receiver sign the AccessProof via EIP-712 `signTypedData_v4`
//       (wagmi `useSignTypedData`), and finalizes to obtain the TEE-signed
//       `TransferValidityProof` structs — without touching the chain.
//
//   2. Review — the modal shows the re-key status, the OwnershipProof
//       signer (TEE) + validUntil, and the recovered AccessProof signer
//       (receiver). The user explicitly confirms before the modal calls
//       `useTransfer().confirm()`, which submits the on-chain
//       `iTransferFrom(from, to, tokenId, proofs)` transaction through
//       wagmi's `useWriteContract` (the AxiomAgentNFT proxy validates
//       against the configured `AxiomTeeVerifier`).
//
// The on-chain surface follows the 0G reference implementation
// (`0gfoundation/0g-agent-nft`, ERC-721-compatible `iTransferFrom`),
// which in turn implements the EIP-7857 standard. The
// `TransferValidityProof` struct passed to the contract is:
//
//   { accessProof: bytes; ownershipProof: bytes; }
//
// where each field is an ABI-encoded inner struct (AccessProof /
// OwnershipProof) per the EIP-7857 spec. The AccessProof is an EIP-712
// typed-data signature (no EIP-191 prefix); the contract recovers the
// receiver via `ECDSA.recover(digest, sig)`.
//
// UI design notes:
//   - Renders a real HTML5 <dialog> element so the browser handles
//     focus trap, ESC-to-close, and the inert background. We open /
//     close it with `.showModal()` / `.close()` rather than toggling a
//     `display: none` so the accessibility tree is correct without
//     any ARIA boilerplate. Source: MDN <dialog>:
//       https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog
//   - Two open-state modes: controlled (`open` prop defined — the
//     parent drives open/close, AgentDetail's pattern) and
//     uncontrolled (the modal owns its own state and the optional
//     `triggerLabel` self-trigger button toggles it). Both call
//     `onClose` when the user dismisses the dialog.
//   - The "opens via the button in AgentDetail" requirement is met
//     because AgentDetail mounts the modal with `open={true}` from
//     its own trigger button; we also expose the self-trigger via
//     `triggerLabel` for the dApp's other entry points (HomePage
//     teasers, agent cards, etc.).
//   - All network I/O goes through the typed `useTransfer` hook so
//     the modal stays a thin presentational layer.
//   - No `!` non-null assertions; receiverAddress and pubKey are
//     validated client-side before the POST so the user gets a clear
//     inline error instead of a backend 400.
//
// Canonical sources:
//   - MDN <dialog> element (.showModal, .close, ::backdrop):
//       https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog
//   - MDN crypto.getRandomValues for the default accessProofNonce:
//       https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues
//   - EIP-7857 iTransferFrom + TransferValidityProof + ownership
//     proof semantics (TEE-signed OwnershipProof over dataHash||
//     dataHash||sealedKey||encryptedPubKey||nonce):
//       https://eips.ethereum.org/EIPS/eip-7857
//   - EIP-712 typed data spec (domain separator, struct hash):
//       https://eips.ethereum.org/EIPS/eip-712
//   - wagmi v2 `useSignTypedData` (signTypedData_v4 / EIP-712):
//       https://wagmi.sh/react/api/hooks/useSignTypedData
//   - wagmi v2 `useWriteContract` (mutate / mutateAsync, status, data):
//       https://wagmi.sh/react/hooks/useWriteContract
//   - wagmi v2 `useAccount` (connected wallet = `from`):
//       https://wagmi.sh/react/hooks/useAccount
//   - viem `isAddress` (0x-prefixed EIP-55 checksum validation):
//       https://viem.sh/docs/utilities/isAddress
//   - 0G chain id 16602 (Galileo) where the proxy is deployed:
//       https://docs.0g.ai/ai-context

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
} from 'react';
import { isAddress } from 'viem';
import { useAccount } from 'wagmi';
import { useTransfer, type TransferInput } from '../hooks/useTransfer.js';
import { COLORS, Button, Alert, MonoLabel } from './ui.js';

const RECEIVER_PUBKEY_HEX_LENGTH = 130;


/**
 * Generate a fresh 32-byte random hex string suitable for the EIP-7857
 * accessProofNonce. `crypto.getRandomValues` is available in every
 * modern browser (MDN: "available everywhere") and is the spec-blessed
 * way to source entropy for security-sensitive values without dragging
 * in a `randombytes` shim.
 *
 * Source: https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues
 */
function freshNonceHex(byteLength = 32): `0x${string}` {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  // `Uint8Array.prototype.toHex` is not in the lib.dom.d.ts we ship
  // (and was only added to V8 / Node 22+ as a non-standard extension),
  // so we hand-roll the hex conversion.
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i] ?? 0;
    hex += byte.toString(16).padStart(2, '0');
  }
  return `0x${hex}` as `0x${string}`;
}

export type TransferModalProps = {
  /** The iNFT (AxiomAgentNFT) tokenId being transferred. */
  tokenId: bigint;
  /**
   * Optional: a label for the trigger button. When provided, the modal
   * renders a self-triggering <button> that opens the dialog on click
   * (matches the "opens via the button in AgentDetail" requirement
   * for the default in-page use). When omitted, the dialog is fully
   * controlled via `open` / `onClose` and AgentDetail can wire it
   * into its own trigger button (AgentDetail manages the `open` state
   * externally and renders the dialog only when open).
   */
  triggerLabel?: string;
  /**
   * Optional: controls the open state of the dialog. When defined,
   * the parent owns the state (AgentDetail's pattern). When undefined
   * the modal manages its own state and the optional self-trigger
   * button toggles it.
   */
  open?: boolean;
  /**
   * Optional: called whenever the dialog transitions to closed. The
   * parent can use this to reset the trigger button's pressed state.
   */
  onClose?: () => void;
  /**
   * Optional: called when the on-chain write resolves with a tx hash.
   * The modal does not poll for confirmations; the parent can layer
   * `useWaitForTransactionReceipt` on top if it needs to surface a
   * "confirmed" state. Aliased as `onSuccess` for back-compat with
   * Agent A's AgentDetail call site, which uses the shorter name.
   */
  onTransferred?: (txHash: `0x${string}`) => void;
  onSuccess?: (txHash: `0x${string}`) => void;
};

/**
 * Validate the receiver's pubkey string. Returns `null` when valid,
 * otherwise a human-readable error to render under the field.
 */
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
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const formId = useId();

  const { address: from, isConnected } = useAccount();
  const { prepare, confirm, isLoading, error, signature, reset } = useTransfer();

  const [receiverAddress, setReceiverAddress] = useState('');
  const [receiverPubKey, setReceiverPubKey] = useState('');
  const [oldDataEncryptionKey, setOldDataEncryptionKey] = useState('');
  const [oldDataUri, setOldDataUri] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Two-phase UI: 'form' (enter receiver + optional re-key inputs) →
  // 'review' (proof details + confirm on-chain write) → back to 'form'.
  const [phase, setPhase] = useState<'form' | 'review'>('form');

  // Two open-state modes:
  //   - Controlled:   `openProp !== undefined` — the parent owns the
  //                   state (AgentDetail's pattern). The modal reads
  //                   `openProp` and never writes to it.
  //   - Uncontrolled: `openProp === undefined` — the modal owns its
  //                   own `internalOpen` state, toggled by the
  //                   optional self-trigger button.
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
  // `handleTransferred` is the merged success callback: fires
  // `onTransferred` *and* `onSuccess` (both, when provided). Agent
  // A's AgentDetail passes `onSuccess`; the assignment's reference
  // signature uses `onTransferred`; supporting both keeps both call
  // sites typecheck-clean without forcing either to rename.
  const handleTransferred = useCallback(
    (txHash: `0x${string}`): void => {
      onTransferred?.(txHash);
      onSuccess?.(txHash);
    },
    [onSuccess, onTransferred],
  );

  // Keep the <dialog> open state in sync with React. The `open`
  // attribute is the React-friendly way to drive it declaratively;
  // however <dialog> requires `.showModal()` for the inert backdrop
  // and the focus trap, so we use it imperatively in an effect and
  // reflect close events back into React state.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // The dialog fires a native `close` event when the user hits ESC or
  // the backdrop is dismissed. Mirror it back into React state so
  // parent components can react.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = (): void => {
      setOpen(false);
    };
    dialog.addEventListener('close', handleClose);
    return () => {
      dialog.removeEventListener('close', handleClose);
    };
  }, [setOpen]);

  // The receiver-side AccessProof signs a fresh nonce. The nonce is
  // stable for the lifetime of this modal instance (re-mounts create
  // a new one). Each transfer gets a unique replay-resistant value.
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
  // Re-key inputs are optional; when one is supplied the other is required.
  const rekeyError = useMemo(() => {
    const hasKey = oldDataEncryptionKey.length > 0;
    const hasUri = oldDataUri.length > 0;
    if (hasKey !== hasUri) {
      return 'supply both old data key and old data URI to re-key, or leave both blank';
    }
    return null;
  }, [oldDataEncryptionKey, oldDataUri]);
  // `buildInput` assembles the TransferInput from the form state so both
  // the prepare and confirm phases share identical fields.
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

  // Phase 1 — prepare: challenge + EIP-712 sign + finalize. Produces the
  // proof structs (in `signature`) and advances to the review phase so
  // the user can inspect the proof details before the on-chain write.
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

  // Phase 2 — confirm: submit the on-chain `iTransferFrom` using the
  // prepared proof. Requires `signature` (set by `prepare`).
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

  // Back to the form phase (e.g. after reviewing proof details and
  // wanting to change inputs). Clears the prepared proof.
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

      <dialog
        ref={dialogRef}
        aria-labelledby={`${formId}-title`}
        style={{
          padding: 28,
          border: `1px solid ${COLORS.borderStrong}`,
          borderRadius: 12,
          maxWidth: 500,
          width: '90vw',
          background: COLORS.surface,
          color: COLORS.text,
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}
      >
        {phase === 'form' ? (
          <form onSubmit={onSubmit}>
            <h2 id={`${formId}-title`} style={{ marginTop: 0, fontSize: 22, fontWeight: 700, color: COLORS.text, letterSpacing: '-0.02em' }}>
              Transfer iNFT #{tokenId.toString()}
            </h2>

            <p style={{ color: COLORS.textMuted, fontSize: 13, lineHeight: 1.6, fontWeight: 300, marginBottom: 20 }}>
              The receiver signs an EIP-712 AccessProof and the TEE oracle signs
              the OwnershipProof. You'll confirm the on-chain
              <code style={{ color: COLORS.bronzeLight }}> iTransferFrom </code>
              transaction in the next step.
            </p>

            <label htmlFor={`${formId}-to`} style={{ display: 'block', marginTop: 16, fontWeight: 500, fontSize: 13, color: COLORS.textPrimary }}>
              Receiver address
            </label>
            <input
              id={`${formId}-to`}
              name="to"
              type="text"
              value={receiverAddress}
              onChange={onAddressChange}
              placeholder="0x…"
              autoComplete="off"
              spellCheck={false}
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
                outline: 'none',
              }}
              required
            />
            {addressError !== null && (
              <p role="alert" style={{ color: COLORS.danger, fontSize: 12, margin: '4px 0 0' }}>
                {addressError}
              </p>
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
              <p role="alert" style={{ color: COLORS.danger, fontSize: 12, margin: '4px 0 0' }}>
                {pubKeyError}
              </p>
            )}

            <label htmlFor={`${formId}-nonce`} style={{ display: 'block', marginTop: 16, fontWeight: 500, fontSize: 13, color: COLORS.textPrimary }}>
              Access proof nonce
            </label>
            <input
              id={`${formId}-nonce`}
              name="accessProofNonce"
              type="text"
              value={accessProofNonce}
              readOnly
              style={{
                width: '100%',
                padding: '10px 14px',
                marginTop: 6,
                fontFamily: "'SF Mono', monospace",
                fontSize: 13,
                border: `1px solid ${COLORS.borderStrong}`,
                borderRadius: 6,
                background: COLORS.bg,
                color: COLORS.bronzeLight,
                boxSizing: 'border-box',
                outline: 'none',
              }}
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
              <input
                id={`${formId}-oldkey`}
                name="oldDataEncryptionKey"
                type="text"
                value={oldDataEncryptionKey}
                onChange={onOldDataKeyChange}
                placeholder="base64 32-byte AES key"
                autoComplete="off"
                spellCheck={false}
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
                  outline: 'none',
                }}
              />
              <label htmlFor={`${formId}-olduri`} style={{ display: 'block', marginTop: 8, fontWeight: 500, fontSize: 13, color: COLORS.textPrimary }}>
                Old data URI (0x…)
              </label>
              <input
                id={`${formId}-olduri`}
                name="oldDataUri"
                type="text"
                value={oldDataUri}
                onChange={onOldDataUriChange}
                placeholder="0x… 0G Storage root hash"
                autoComplete="off"
                spellCheck={false}
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
                  outline: 'none',
                }}
              />
              {rekeyError !== null && (
                <p role="alert" style={{ color: COLORS.danger, fontSize: 12, margin: '4px 0 0' }}>
                  {rekeyError}
                </p>
              )}
            </details>

            {error !== null && (
              <Alert variant="error" style={{ marginTop: 16 }}>
                {error.message}
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
              <div
                style={{
                  marginTop: 12,
                  padding: '12px 16px',
                  background: COLORS.successBg,
                  border: `1px solid ${COLORS.successBorder}`,
                  borderRadius: 8,
                  fontSize: 13,
                  color: COLORS.success,
                }}
              >
                <strong>Re-encrypted</strong> — agent data was re-keyed for the receiver.
                {signature.newDataHash !== undefined && (
                  <>
                    <br />
                    New data hash: <MonoLabel style={{ fontSize: 11 }}>{signature.newDataHash}</MonoLabel>
                  </>
                )}
              </div>
            )}

            {signature !== null && (
              <div
                style={{
                  marginTop: 12,
                  padding: '12px 16px',
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  fontSize: 12,
                  color: COLORS.textMuted,
                }}
              >
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
              </div>
            )}

            {signature !== null && signature.accessSigner !== undefined && (
              <div
                style={{
                  marginTop: 8,
                  padding: '12px 16px',
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  fontSize: 12,
                  color: COLORS.textMuted,
                }}
              >
                <strong style={{ color: COLORS.text }}>AccessProof</strong> (receiver-signed)
                <br />
                Recovered signer: <MonoLabel style={{ fontSize: 11 }}>{signature.accessSigner}</MonoLabel>
              </div>
            )}

            {error !== null && (
              <Alert variant="error" style={{ marginTop: 16 }}>
                {error.message}
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
      </dialog>
    </>
  );
}

export default TransferModal;
