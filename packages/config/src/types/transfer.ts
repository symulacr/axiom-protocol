export type TransferPhase =
  "idle" | "challenge" | "signing" | "finalizing" | "confirming";

export type TransferInput = {
  tokenId: bigint;
  to: `0x${string}`;
  /** P3 §(b)#4: resolved at prepare time from `to` via
   * GET /v1/registry/pubkey/:address — no longer a required user field. */
  receiverPubKey64?: `0x${string}`;
  /** Optional manual 130-hex paste (Advanced fallback when the address has
   * no on-chain-recoverable key). Wins over the registry lookup. */
  receiverPubKeyManual?: string;
  /** Deprecated (P3 §(b)#5): the backend derives a canonical nonce per
   * challenge (`BigInt(accessProofNonce ?? 0)` + canonicalNonce); the
   * frontend no longer sends one. Kept optional for back-compat callers. */
  accessProofNonce?: `0x${string}`;
  oldDataEncryptionKey?: string; // Base64 32-byte AES key; FE seals to oracle pubkey before wire (never cleartext)
  sealedDataEncryptionKey?: string; // optional pre-sealed DEK; when set, wins over sealing the oldDataEncryptionKey
  oldDataUri?: `0x${string}`;
};

type AccessProofStruct = {
  dataHash: `0x${string}`;
  targetPubkey: `0x${string}`;
  nonce: bigint;
  proof: `0x${string}`;
  validUntil: bigint;
};

type OwnershipProofStruct = {
  oracleType: number;
  dataHash: `0x${string}`;
  sealedKey: `0x${string}`;
  targetPubkey: `0x${string}`;
  nonce: bigint;
  proof: `0x${string}`;
  validUntil: bigint;
};

export type TransferResponse = {
  ok: boolean;
  stage: "challenge" | "final";
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
