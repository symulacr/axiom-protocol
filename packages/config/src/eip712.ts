import {
  toUtf8Bytes,
  keccak256,
  AbiCoder,
  concat,
  getBytes,
  SigningKey,
  computeAddress,
} from "ethers";
import type { Hex } from "viem";

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
  // Canonical Galileo testnet verifier (confirmed from DEPLOYED_ADDRESSES.teeVerifier in addresses.ts).
  // Production MUST override this default via buildEip712Domain(config.addresses.verifier).
  verifyingContract: "0x60B9d53F5410b6586D2D5395D4A309E3C9E5595A",
};

/** Construct an Eip712Domain from a numeric chain id and verifier address. */
export function buildEip712Domain(
  chainId: number,
  verifyingContract: `0x${string}`,
): Eip712Domain {
  return {
    chainId: BigInt(chainId),
    verifyingContract,
  };
}

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

function eip712TypeString(
  typeName: string,
  fields: ReadonlyArray<{ name: string; type: string }>,
): string {
  return `${typeName}(${fields.map((f) => `${f.type} ${f.name}`).join(",")})`;
}

const EIP712_DOMAIN_TYPEHASH = keccak256(
  toUtf8Bytes(
    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
  ),
);
const OWNERSHIP_PROOF_TYPEHASH = keccak256(
  toUtf8Bytes(
    eip712TypeString("OwnershipProof", OWNERSHIP_PROOF_TYPES.OwnershipProof),
  ),
);
const ACCESS_PROOF_TYPEHASH = keccak256(
  toUtf8Bytes(eip712TypeString("AccessProof", ACCESS_PROOF_TYPES.AccessProof)),
);

const VERIFIER_NAME_HASH = keccak256(toUtf8Bytes(EIP712_DOMAIN_NAME));
const VERIFIER_VERSION_HASH = keccak256(toUtf8Bytes(EIP712_DOMAIN_VERSION));

const abiCoder = AbiCoder.defaultAbiCoder();

/** EIP-712 domain separator — keccak256(abi.encode(EIP712Domain(...))). Mirrors AxiomTeeVerifier._domainSeparator(). */
export function domainSeparator(domain?: Eip712Domain): Hex {
  const activeDomain = domain ?? DEFAULT_EIP712_DOMAIN;
  return keccak256(
    abiCoder.encode(
      ["bytes32", "bytes32", "bytes32", "uint256", "address"],
      [
        EIP712_DOMAIN_TYPEHASH,
        VERIFIER_NAME_HASH,
        VERIFIER_VERSION_HASH,
        activeDomain.chainId,
        activeDomain.verifyingContract,
      ],
    ),
  ) as Hex;
}

export interface OwnershipProofInput {
  dataHash: Hex;
  sealedKey: Hex;
  targetPubkey: Hex;
  to: Hex;
  nft: Hex;
  nonce: bigint;
  /// Unix-seconds deadline. Must be in the future within maxProofAgeSeconds.
  validUntil: bigint;
}

export interface AccessProofInput {
  dataHash: Hex;
  targetPubkey: Hex;
  to: Hex;
  nft: Hex;
  nonce: bigint;
  /// Unix-seconds deadline.
  validUntil: bigint;
}

export interface OwnershipProofResult {
  newDataUri: Hex;
  newDataHash: Hex;
  sealedKey: Hex;
  ownershipSignature: Hex;
}

export interface OwnershipProofResultWithMeta extends OwnershipProofResult {
  accessProofNonce?: number;
  ownershipProofNonce?: number;
  signer?: Hex;
}

export function ownershipStructHash(input: OwnershipProofInput): Hex {
  return keccak256(
    abiCoder.encode(
      [
        "bytes32",
        "bytes32",
        "bytes32",
        "bytes32",
        "address",
        "address",
        "uint256",
        "uint256",
      ],
      [
        OWNERSHIP_PROOF_TYPEHASH,
        input.dataHash,
        keccak256(input.sealedKey),
        keccak256(input.targetPubkey),
        input.to,
        input.nft,
        input.nonce,
        input.validUntil,
      ],
    ),
  ) as Hex;
}

export function accessStructHash(input: AccessProofInput): Hex {
  return keccak256(
    abiCoder.encode(
      [
        "bytes32",
        "bytes32",
        "bytes32",
        "address",
        "address",
        "uint256",
        "uint256",
      ],
      [
        ACCESS_PROOF_TYPEHASH,
        input.dataHash,
        keccak256(input.targetPubkey),
        input.to,
        input.nft,
        input.nonce,
        input.validUntil,
      ],
    ),
  ) as Hex;
}

/** Full EIP-712 OwnershipProof digest (signed by TEE oracle). */
export function ownershipMessageHash(
  input: OwnershipProofInput,
  domain?: Eip712Domain,
): Hex {
  return keccak256(
    concat(["0x1901", domainSeparator(domain), ownershipStructHash(input)]),
  ) as Hex;
}

/** Full EIP-712 AccessProof digest (signed by receiver). */
export function accessMessageHash(
  input: AccessProofInput,
  domain?: Eip712Domain,
): Hex {
  return keccak256(
    concat(["0x1901", domainSeparator(domain), accessStructHash(input)]),
  ) as Hex;
}

/** Recover the signer of a raw-ECDSA AccessProof signature. */
export function recoverAccessSigner(
  signature: Hex,
  input: AccessProofInput,
  domain?: Eip712Domain,
): Hex {
  const recovered = SigningKey.recoverPublicKey(
    getBytes(accessMessageHash(input, domain)),
    signature,
  );
  return computeAddress(recovered) as Hex;
}
