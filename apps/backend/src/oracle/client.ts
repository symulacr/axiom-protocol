import {
  recoverAccessSigner,
  type Eip712Domain,
  type OwnershipProofInput,
  type AccessProofInput,
  type OwnershipProofResult,
  type OwnershipProofResultWithMeta,
} from "@axiom/config";
export type { OwnershipProofInput, OwnershipProofResult, AccessProofInput };
import { bigintReplacer } from "@axiom/config";

const ORACLE_TIMEOUT_MS = 10_000;

export interface OracleClientConfig {
  baseUrl: string; // e.g., "http://127.0.0.1:8787"
  timeoutMs?: number;
  apiKey?: string;
}

export interface TransferValidityInput {
  oldDataHash: `0x${string}`;
  oldDataUri: `0x${string}`;
  targetPubkey64: `0x${string}`;
  accessProofNonce: string | number;
  ownershipProofNonce?: string | number;
  /** ECIES-sealed DEK to oracle pubkey (required for re-key) */
  sealedDataEncryptionKey?: string;
  to: `0x${string}`;
  nft: `0x${string}`;
}

export interface TransferValidityResult extends OwnershipProofResultWithMeta {
  validUntil?: string;
}

export interface OracleClient {
  health(): Promise<{ ok: boolean; signer: `0x${string}`; version: string }>;
  transferValidity(
    input: TransferValidityInput,
  ): Promise<TransferValidityResult>;
  signOwnership(input: OwnershipProofInput): Promise<{
    signature: `0x${string}`;
    signer: `0x${string}`;
    validUntil: string;
  }>;
  recoverAccessSigner(
    signature: `0x${string}`,
    input: AccessProofInput,
    domain?: Eip712Domain,
  ): Promise<{ recovered: `0x${string}`; input: AccessProofInput }>;
}

export class DefaultSignerOracleClient implements OracleClient {
  private readonly baseUrl: string;

  constructor(private readonly config: OracleClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { ...extra };
    if (this.config.apiKey) h["x-api-key"] = this.config.apiKey;
    return h;
  }

  health(): Promise<{ ok: boolean; signer: `0x${string}`; version: string }> {
    return this.get<{ ok: boolean; signer: `0x${string}`; version: string }>(
      "/health",
    );
  }

  transferValidity(
    input: TransferValidityInput,
  ): Promise<TransferValidityResult> {
    return this.post<TransferValidityResult>("/v1/transfer-validity", input);
  }

  signOwnership(input: OwnershipProofInput): Promise<{
    signature: `0x${string}`;
    signer: `0x${string}`;
    validUntil: string;
  }> {
    return this.post("/v1/ownership", input);
  }

  recoverAccessSigner(
    signature: `0x${string}`,
    input: AccessProofInput,
    domain?: Eip712Domain,
  ) {
    return Promise.resolve({
      recovered: recoverAccessSigner(signature, input, domain),
      input,
    });
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: object,
  ): Promise<T> {
    const timeout = this.config.timeoutMs ?? ORACLE_TIMEOUT_MS;
    const headers = this.headers(
      method === "POST" ? { "Content-Type": "application/json" } : undefined,
    );
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body, bigintReplacer) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Oracle ${path} returned ${res.status}: ${text.slice(0, 200)}`,
      );
    }
    return (await res.json()) as T;
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  private post<T>(path: string, input: object): Promise<T> {
    return this.request<T>("POST", path, input);
  }
}
