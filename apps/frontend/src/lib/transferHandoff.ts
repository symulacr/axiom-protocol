/**
 * Cross-wallet transfer handoff (P4 — F-01 residual).
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

export const TRANSFER_CO_SIGN_PATH = "/transfer/co-sign";

/** localStorage key the receiver page writes and the sender tab listens to
 *  (`storage` event) when both live in the same browser. */
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
   *  the message and domain above are what the wallet signs). */
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
/** 65-byte ECDSA signature: r(32) + s(32) + v(1) as hex. */
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
  // bigint (validUntil) is not JSON-serializable — carry it as a string and
  // restore on decode.
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
    // validUntil serializes as a decimal string; accept bigint (in-memory) or
    // a clean decimal string — anything else is a damaged payload.
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
   *  paused challenge before applying (guards stale cross-tab results). */
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
