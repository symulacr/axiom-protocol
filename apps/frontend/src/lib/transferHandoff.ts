/**
 * Cross-wallet transfer handoff.
 *
 * When the receiver is NOT available in the sender's wallet (a different
 * person/device), the co-sign step cannot run in-session. This module packs
 * the paused challenge's EIP-712 AccessProof into a shareable URL payload
 * (`/transfer/co-sign?data=…`, base64url of the typed data — ~1 KB, URL-safe)
 * and defines the code the receiver's wallet hands back: the raw acceptance
 * signature. The sender always submits the on-chain transaction; the receiver
 * only ever signs the acceptance.
 *
 * Pure functions only — no React, no wagmi — so the encoding round-trip and
 * shape guards are unit-testable (transferHandoff.test.ts).
 */

import type {
  TransferInput,
  TransferResponse,
} from "@axiom/config/types/transfer";
import { freshNonceHex, humanizeError } from "../utils/format.js";

/** Thrown when the connected wallet cannot expose the receiver account, so the
 * co-sign can never succeed from this session — the GUI renders an honest
 * blocker (change recipient / let the receiver sign from their own session),
 * never a futile retry. */
export class ReceiverAccountUnavailableError extends Error {
  readonly receiver: `0x${string}`;
  constructor(receiver: `0x${string}`) {
    super(
      `The receiving account ${receiver} is not available in the connected wallet.`,
    );
    this.name = "ReceiverAccountUnavailableError";
    this.receiver = receiver;
  }
}

export function isReceiverAccountUnavailable(
  err: unknown,
): err is ReceiverAccountUnavailableError {
  return (
    err instanceof ReceiverAccountUnavailableError ||
    (err instanceof Error && err.name === "ReceiverAccountUnavailableError")
  );
}

export const TRANSFER_CO_SIGN_PATH = "/transfer/co-sign";

/** localStorage key the receiver page writes and the sender tab listens to
 * (`storage` event) when both live in the same browser. */
export const HANDOFF_RESULT_STORAGE_KEY = "axiom-transfer-cosign-result";

/** Canonical AccessProof message — same shape useTransfer signs. */
export type AccessProofMessage = {
  dataHash: `0x${string}`;
  targetPubkey: `0x${string}`;
  to: `0x${string}`;
  nft: `0x${string}`;
  /** Canonical hex (toBeHex semantics) — never the decimal echo. */
  nonce: `0x${string}`;
  validUntil: bigint;
};

export type TransferHandoffPayload = {
  v: 1;
  typedData: {
    domain: {
      name: string;
      version: string;
      chainId: number;
      verifyingContract: `0x${string}`;
    };
    primaryType: "AccessProof";
    message: AccessProofMessage;
  };
  /** Display + validation metadata (never trusted for the signature itself —
   * the message and domain above are what the wallet signs). */
  meta: {
    tokenId: string;
    sender: `0x${string}`;
    receiver: `0x${string}`;
    /** UNIX seconds — mirrors message.validUntil for the honest expiry state. */
    validUntil: string;
  };
};

const HEX_0X = /^0x[0-9a-fA-F]+$/;
const ETH_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/** 65-byte ECDSA signature: r + s + v as hex. */
export const ACCEPTANCE_CODE_SHAPE = /^0x[0-9a-fA-F]{130}$/;

/* --- base64url (no dependencies) ------------------------------------------ */

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToBytes(encoded: string): Uint8Array {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/* --- payload encode / decode ---------------------------------------------- */

export function encodeHandoffPayload(payload: TransferHandoffPayload): string {
  // bigint (validUntil) is not JSON-serializable — carried as a string, restored on decode.
  const portable = {
    ...payload,
    typedData: {
      ...payload.typedData,
      message: {
        ...payload.typedData.message,
        validUntil: payload.typedData.message.validUntil.toString(),
      },
    },
  };
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(portable)));
}

export function decodeHandoffPayload(
  encoded: string,
): TransferHandoffPayload | null {
  try {
    const raw = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(encoded)),
    ) as {
      v?: number;
      typedData?: {
        domain?: {
          name?: unknown;
          version?: unknown;
          chainId?: unknown;
          verifyingContract?: unknown;
        };
        primaryType?: unknown;
        message?: Record<string, unknown>;
      };
      meta?: {
        tokenId?: unknown;
        sender?: unknown;
        receiver?: unknown;
        validUntil?: unknown;
      };
    };
    if (raw.v !== 1) return null;
    const d = raw.typedData?.domain;
    const m = raw.typedData?.message;
    const meta = raw.meta;
    if (!d || !m || !meta) return null;
    if (raw.typedData?.primaryType !== "AccessProof") return null;
    const str = (v: unknown): string | null =>
      typeof v === "string" ? v : null;
    const hex = (v: unknown): `0x${string}` | null => {
      const s = str(v);
      return s && HEX_0X.test(s) ? (s as `0x${string}`) : null;
    };
    const message = {
      dataHash: hex(m.dataHash),
      targetPubkey: hex(m.targetPubkey),
      to: hex(m.to),
      nft: hex(m.nft),
      nonce: hex(m.nonce),
    };
    // validUntil serializes as decimal string; accept bigint (in-memory) or clean decimal — else damaged.
    const validUntil =
      typeof m.validUntil === "bigint"
        ? m.validUntil
        : typeof m.validUntil === "string" && /^\d+$/.test(m.validUntil)
          ? BigInt(m.validUntil)
          : null;
    if (
      !message.dataHash ||
      !message.targetPubkey ||
      !message.to ||
      !message.nft ||
      !message.nonce ||
      validUntil === null
    ) {
      return null;
    }
    if (
      typeof d.name !== "string" ||
      typeof d.version !== "string" ||
      typeof d.chainId !== "number" ||
      !hex(d.verifyingContract)
    ) {
      return null;
    }
    const sender = str(meta.sender);
    const receiver = str(meta.receiver);
    if (
      !/^\d+$/.test(String(meta.tokenId ?? "")) ||
      !sender ||
      !receiver ||
      !ETH_ADDRESS.test(sender) ||
      !ETH_ADDRESS.test(receiver)
    ) {
      return null;
    }
    return {
      v: 1,
      typedData: {
        domain: {
          name: d.name,
          version: d.version,
          chainId: d.chainId,
          verifyingContract: hex(d.verifyingContract)!,
        },
        primaryType: "AccessProof",
        message: {
          dataHash: message.dataHash,
          targetPubkey: message.targetPubkey,
          to: message.to,
          nft: message.nft,
          nonce: message.nonce,
          validUntil,
        },
      },
      meta: {
        tokenId: String(meta.tokenId),
        sender: sender as `0x${string}`,
        receiver: receiver as `0x${string}`,
        validUntil: String(meta.validUntil ?? ""),
      },
    };
  } catch {
    return null;
  }
}

export function handoffUrl(encoded: string, origin?: string): string {
  const base =
    origin ?? (typeof window === "undefined" ? "" : window.location.origin);
  return `${base}${TRANSFER_CO_SIGN_PATH}?data=${encoded}`;
}

/* --- receiver → sender result ---------------------------------------------- */

export type HandoffResult = {
  v: 1;
  /** The receiver's acceptance signature (0x + 130 hex chars). */
  signature: `0x${string}`;
  /** Echo of the signed nonce — lets the sender tab match the result to the
   * paused challenge before applying (guards stale cross-tab results). */
  nonce: `0x${string}`;
  at: number;
};

export function encodeHandoffResult(
  signature: `0x${string}`,
  nonce: `0x${string}`,
): string {
  const result: HandoffResult = {
    v: 1,
    signature,
    nonce,
    at: Date.now(),
  };
  return JSON.stringify(result);
}

export function decodeHandoffResult(raw: string | null): HandoffResult | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<HandoffResult>;
    if (
      parsed.v !== 1 ||
      typeof parsed.signature !== "string" ||
      !ACCEPTANCE_CODE_SHAPE.test(parsed.signature) ||
      typeof parsed.nonce !== "string" ||
      !HEX_0X.test(parsed.nonce) ||
      typeof parsed.at !== "number"
    ) {
      return null;
    }
    return parsed as HandoffResult;
  } catch {
    return null;
  }
}

/* --- U26: one-piece claim token / claim link ------------------------------ */

/** Sender-side flow path that consumes `?result=<token>` claim links. */
export const TRANSFER_CLAIM_PATH = "/transfer";

/** The receiver's acceptance as a compact base64url token — the whole thing
 * a receiver copies/sends (the raw 130-hex signature hides behind "Advanced"). */
export function encodeHandoffResultToken(
  signature: `0x${string}`,
  nonce: `0x${string}`,
): string {
  return bytesToBase64Url(
    new TextEncoder().encode(encodeHandoffResult(signature, nonce)),
  );
}

export function decodeHandoffResultToken(token: string): HandoffResult | null {
  try {
    return decodeHandoffResult(
      new TextDecoder().decode(base64UrlToBytes(token)),
    );
  } catch {
    return null;
  }
}

/** Full claim link (`/transfer?result=…`) the receiver pastes to the sender. */
export function handoffClaimUrl(token: string, origin?: string): string {
  const base =
    origin ?? (typeof window === "undefined" ? "" : window.location.origin);
  return `${base}${TRANSFER_CLAIM_PATH}?result=${token}`;
}

/* --- shared transfer/co-sign orchestration -------------------------------- */

/* Phase machines, post-sign continuation and error surfaces stay per-surface
 * on purpose — the modal pauses at review; FlowPage chains confirm+receipt. */

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
