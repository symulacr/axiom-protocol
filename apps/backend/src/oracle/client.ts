import type { OwnershipProofInput, OwnershipProofResult, AccessProofInput } from "@axiom/oracle/signer";
export type { OwnershipProofInput, OwnershipProofResult, AccessProofInput };
import { recoverAccessSigner, type Eip712Domain } from "@axiom/oracle/signer";
import { bigintReplacer } from "../server.js";

/**
 * HTTP client for the TEE signer service (apps/oracle).
 * The oracle signs the OwnershipProof payload (TEE-side) and the backend
 * recovers the AccessProof signer locally using the same canonical hash.
 *
 * Two signing modes:
 *  - signOwnership (/v1/ownership): sign-only — the caller supplies the
 *    sealedKey; no re-encryption occurs. Used as a fallback when the client
 *    does not provide re-key inputs.
 *  - transferValidity (/v1/transfer-validity): full re-key — the oracle
 *    downloads the old ciphertext, decrypts with the caller-supplied
 *    oldDataEncryptionKey, generates a fresh AES-256 key, re-encrypts,
 *    uploads the new blob to 0G Storage, ECIES-seals the new key for the
 *    receiver, and signs the OwnershipProof over the re-keyed payload.
 */

export interface OracleClientConfig {
  baseUrl: string; // e.g., "http://127.0.0.1:8787"
  /** Timeout in milliseconds for each HTTP request. Defaults to 10_000. */
  timeoutMs?: number;
}

/**
 * Request body for /v1/transfer-validity (full re-key).
 * Mirrors apps/oracle/src/server.ts POST /v1/transfer-validity handler.
 */
export interface TransferValidityInput {
  /** 32-byte hex dataHash of the existing ciphertext (the on-chain iData hash). */
  oldDataHash: `0x${string}`;
  /** 0G Storage root hash / blob identifier of the existing ciphertext. */
  oldDataUri: `0x${string}`;
  /** Receiver's 64-byte uncompressed public key (X||Y, no 0x04 prefix; 0x + 128 hex). */
  targetPubkey64: `0x${string}`;
  /** Nonce for the AccessProof (receiver's signature). */
  accessProofNonce: string | number;
  /** Nonce for the OwnershipProof (TEE signature). Defaults to accessProofNonce. */
  ownershipProofNonce?: string | number;
  /** Base64-encoded 32-byte AES-256 key that decrypts the old ciphertext. */
  oldDataEncryptionKey: string;
  /** Receiver's address (0x-prefixed, 20 bytes). */
  to: `0x${string}`;
  /** NFT contract address. */
  nft: `0x${string}`;
}

/**
 * Response from /v1/transfer-validity. Extends OwnershipProofResult with the
 * validUntil the oracle used when signing (so the backend can build a matching
 * AccessProof challenge without clock-skew).
 */
export interface TransferValidityResult extends OwnershipProofResult {
  /** Unix-seconds deadline the oracle used in the OwnershipProof signature. */
  validUntil?: string;
}

export interface OracleClient {
  health(): Promise<{ ok: boolean; signer: `0x${string}`; version: string }>;
  transferValidity(input: TransferValidityInput): Promise<TransferValidityResult>;
  signOwnership(input: OwnershipProofInput): Promise<{ signature: `0x${string}`; signer: `0x${string}`; validUntil: string }>;
  recoverAccessSigner(signature: `0x${string}`, input: AccessProofInput, domain?: Eip712Domain): Promise<{ recovered: `0x${string}`; input: AccessProofInput }>;
}

export class DefaultSignerOracleClient implements OracleClient {
  private readonly baseUrl: string;

  constructor(private readonly config: OracleClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
  }

  health() { return this.get<{ ok: boolean; signer: `0x${string}`; version: string }>("/health"); }

  transferValidity(input: TransferValidityInput): Promise<TransferValidityResult> {
    return this.post<TransferValidityResult>("/v1/transfer-validity", input);
  }

  signOwnership(input: OwnershipProofInput): Promise<{ signature: `0x${string}`; signer: `0x${string}`; validUntil: string }> {
    return this.post("/v1/ownership", input);
  }

  /**
   * Performed locally (not via the oracle) — the receiver signs in their
   * wallet; the backend recovers over the same hash the on-chain verifier
   * expects (`accessMessageHash`).
   */
  recoverAccessSigner(signature: `0x${string}`, input: AccessProofInput, domain?: Eip712Domain) {
    return Promise.resolve({ recovered: recoverAccessSigner(signature, input, domain), input });
  }

  private async get<T>(path: string): Promise<T> {
    const timeout = this.config.timeoutMs ?? 10_000;
    const res = await fetch(`${this.baseUrl}${path}`, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) throw new Error(`Oracle ${path} returned ${res.status}`);
    return (await res.json()) as T;
  }

  private async post<T>(path: string, input: object): Promise<T> {
    const timeout = this.config.timeoutMs ?? 10_000;
    const body = JSON.stringify(input, bigintReplacer);
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Oracle ${path} returned ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }
}
