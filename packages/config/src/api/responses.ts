// Canonical API response types shared between backend and frontend.
// Backend route handlers produce these shapes; frontend hooks consume them.
// Import from @axiom/config/api/responses in both layers.

import type { Address, Hex } from "viem";

/** Response from GET /v1/health */
export interface HealthResponse {
  ok: boolean;
  version: string;
  signer: Address;
  chainHead: number;
  oracle: "up" | "down";
  addresses: Record<string, Address> | null;
}

/** Response from POST /v1/agents/mint */
export interface MintResponse {
  ok: boolean;
  agentNft: Address;
  owner: Address;
  tokenId: string;
  dataHash: Hex;
  txHash: Hex;
}

/** Response from POST /v1/agents/:id/transfer */
export interface TransferChallengeResponse {
  ok: boolean;
  stage: "challenge" | "final";
  tokenId: string;
  to: Address;
  dataHash?: Hex;
  oldDataHash?: Hex;
  newDataHash?: Hex;
  newDataUri?: Hex;
  targetPubkey?: Hex;
  accessProofNonce?: string;
  validUntil?: string;
  sealedKey?: Hex;
  ownershipSignature?: Hex;
  signer?: Address;
  accessSigner?: Address;
  rekeyed?: boolean;
  accessProof?: AccessProofStruct;
  ownershipProof?: OwnershipProofStruct;
}

export interface AccessProofStruct {
  dataHash: Hex;
  targetPubkey: Hex;
  nonce: string;
  proof: Hex;
  validUntil: string;
}

export interface OwnershipProofStruct {
  oracleType: number;
  dataHash: Hex;
  sealedKey: Hex;
  targetPubkey: Hex;
  nonce: string;
  proof: Hex;
  validUntil: string;
}

/** Stored event returned by GET /v1/events */
export interface StoredEvent {
  source: string;
  chainId: number;
  blockNumber: number;
  txHash: string;
  logIndex: number;
  eventName: string;
  payload: Record<string, unknown>;
  receivedAt: number;
}

/** Response from GET /v1/payment/config */
export interface PaymentConfigResponse {
  paymentToken: Address;
  protocolFeeBps: number;
  protocolTreasury: Address;
}

/** Response from POST /v1/agents/:id/royalty */
export interface RoyaltyResponse {
  ok: boolean;
  tokenId: string;
  bps: number;
  to: Address;
  data: Hex;
  value: string;
}

/** Response from POST /v1/orchestrator/tick */
export interface TickResponse {
  recommendation: { action: "buy" | "sell" | "hold"; amount?: number; reason: string };
  rawModelOutput: string;
  onchain: { vaultBalance: string; recentEvents: unknown[] };
  storage: { rootHash: Hex; size: number };
  execution?: {
    txHash: Hex;
    action: string;
    target: Hex;
    success: boolean;
    result?: Hex;
    gasUsed?: string;
  };
  durationMs: number;
}
