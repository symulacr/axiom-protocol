// Canonical EIP-712 domain and type definitions for Axiom Protocol. Both @axiom/oracle and @axiom/frontend MUST import from here rather than duplicating type strings or schema objects.

export const EIP712_DOMAIN_NAME = "AxiomTeeVerifier" as const;
export const EIP712_DOMAIN_VERSION = "1" as const;

export interface Eip712Domain {
  chainId: bigint;
  verifyingContract: `0x${string}`;
}

/** Default domain for Galileo testnet. Production MUST pass real chain id + verifier address. */
export const DEFAULT_EIP712_DOMAIN: Eip712Domain = {
  chainId: 16602n,
  verifyingContract: "0xB27c73aD01f61Ec1FDC302dF2350326228F14c11",
};


export const ACCESS_PROOF_TYPES = {
  AccessProof: [
    { name: "dataHash", type: "bytes32" as const },
    { name: "targetPubkey", type: "bytes" as const },
    { name: "to", type: "address" as const },
    { name: "nft", type: "address" as const },
    { name: "nonce", type: "uint256" as const },
    { name: "validUntil", type: "uint256" as const },
  ],
} as const;


export const OWNERSHIP_PROOF_TYPES = {
  OwnershipProof: [
    { name: "dataHash", type: "bytes32" as const },
    { name: "sealedKey", type: "bytes" as const },
    { name: "targetPubkey", type: "bytes" as const },
    { name: "to", type: "address" as const },
    { name: "nft", type: "address" as const },
    { name: "nonce", type: "uint256" as const },
    { name: "validUntil", type: "uint256" as const },
  ],
} as const;
