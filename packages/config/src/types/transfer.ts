/** Shared transfer types. Used by both backend (orchestrator) and frontend (hooks). */

export type TransferPhase = 'idle' | 'challenge' | 'signing' | 'finalizing' | 'confirming';

export type TransferInput = {
  tokenId: bigint;
  to: `0x${string}`;
  receiverPubKey64: `0x${string}`;
  accessProofNonce: `0x${string}`;
  oldDataEncryptionKey?: string;
  oldDataUri?: `0x${string}`;
};

/** Backend response to `POST /v1/agents/:tokenId/transfer` (frontend-relevant fields). */
export type AccessProofStruct = {
  dataHash: `0x${string}`;
  targetPubkey: `0x${string}`;
  nonce: bigint;
  proof: `0x${string}`;
  validUntil: bigint;
};

export type OwnershipProofStruct = {
  oracleType: number;
  dataHash: `0x${string}`;
  sealedKey: `0x${string}`;
  targetPubkey: `0x${string}`;
  nonce: bigint;
  proof: `0x${string}`;
  validUntil: bigint;
};

/** Backend response for the two-stage transfer protocol (challenge → final). */
export type TransferResponse = {
  ok: boolean;
  stage: 'challenge' | 'final';
  tokenId: string;
  to: `0x${string}`;
  dataHash?: `0x${string}`;
  oldDataHash?: `0x${string}`;
  newDataHash?: `0x${string}`;
  newDataUri?: `0x${string}`;
  targetPubkey?: `0x${string}`;
  accessProofNonce?: number | string;
  validUntil?: string;
  sealedKey?: `0x${string}`;
  ownershipSignature?: `0x${string}`;
  signer?: `0x${string}`;
  accessSigner?: `0x${string}`;
  rekeyed?: boolean;
  accessProof?: AccessProofStruct;
  ownershipProof?: OwnershipProofStruct;
};
