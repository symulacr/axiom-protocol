/**
 * Shared transfer/co-sign orchestration primitives — extracted verbatim from
 * TransferModal.tsx and FlowPage.tsx (behavior-identical refactor).
 *
 * Covers exactly the three pieces both implementations carried:
 *   1. buildTransferInput   — canonical TransferInput assembly; the optional
 *      re-key pair is attached only when BOTH halves are present.
 *   2. freshAccessProofNonce — one canonical 32-byte single-use nonce per
 *      challenge, regenerated on every edit/restart (nonces are single-use).
 *   3. runCoSignStep        — classifies a co-sign attempt into signed /
 *      blocked / failed: when the connected wallet cannot expose the receiver
 *      account the step is an honest blocker (remedies only), never a
 *      retryable failure; every other error surfaces humanized.
 *
 * Deliberately NOT extracted (the consumers genuinely diverge):
 *   - phase machines: modal-local form/co-sign/review state vs the page-wide
 *     OperationDraftPhase reducer with its handoff panel;
 *   - post-sign continuation: the modal pauses at review, FlowPage chains
 *     confirm() + receipt pipeline + notices immediately;
 *   - cross-wallet handoff encoding/linking (FlowPage only — transferHandoff.ts);
 *   - error surfaces: modal submitError string vs draft recoverable-error +
 *     notice dispatch.
 *
 * Pure logic only — no React, no wagmi — mirroring transferHandoff.ts.
 */

import {
  isReceiverAccountUnavailable,
  type TransferInput,
  type TransferResponse,
} from "../hooks/useTransfer.js";
import { freshNonceHex, humanizeError } from "../utils/format.js";

/** Canonical single-use access-proof nonce (freshNonceHex default = 32 bytes). */
export function freshAccessProofNonce(): `0x${string}` {
  return freshNonceHex(32);
}

export type TransferInputFields = {
  tokenId: bigint;
  /** Receiver address — trimming/validation stays at the call sites. */
  to: string;
  /** Receiver public key (0x-prefixed X||Y, 130 chars). */
  receiverPubKey64: string;
  accessProofNonce: `0x${string}`;
};

/** Attach the optional re-key pair only when both halves are supplied —
 * a lone key or URI is rejected upstream by each surface's own validation. */
export function buildTransferInput(
  fields: TransferInputFields,
  rekey?: { oldDataEncryptionKey: string; oldDataUri: string },
): TransferInput {
  const input: TransferInput = {
    tokenId: fields.tokenId,
    to: fields.to as `0x${string}`,
    receiverPubKey64: fields.receiverPubKey64 as `0x${string}`,
    accessProofNonce: fields.accessProofNonce,
  };
  if (
    rekey &&
    rekey.oldDataEncryptionKey.length > 0 &&
    rekey.oldDataUri.length > 0
  ) {
    input.oldDataEncryptionKey = rekey.oldDataEncryptionKey;
    input.oldDataUri = rekey.oldDataUri as `0x${string}`;
  }
  return input;
}

/** Outcome of one co-sign attempt. `blocked` = ReceiverAccountUnavailable —
 * this wallet can never sign for the receiver (honest blocker, no retry);
 * `failed` carries the humanized message for the caller's error surface. */
export type CoSignAttempt =
  | { outcome: "signed"; proof: TransferResponse }
  | { outcome: "blocked" }
  | { outcome: "failed"; message: string };

/** Classify a co-sign call — the exact branching TransferModal and FlowPage
 * previously duplicated around useTransfer.coSign(). */
export async function runCoSignStep(
  coSign: () => Promise<TransferResponse>,
): Promise<CoSignAttempt> {
  try {
    return { outcome: "signed", proof: await coSign() };
  } catch (err) {
    if (isReceiverAccountUnavailable(err)) {
      return { outcome: "blocked" };
    }
    return { outcome: "failed", message: humanizeError(err) };
  }
}
