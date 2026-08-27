import {
  toUtf8Bytes,
  keccak256,
  AbiCoder,
  concat,
  getBytes,
  SigningKey,
  computeAddress,
  toBeHex,
  zeroPadValue,
} from "ethers";
import type { Hex } from "viem";

export const EIP712_DOMAIN_NAME = "AxiomTeeVerifier" as const;
export const EIP712_DOMAIN_VERSION = "1" as const;

/**
 * Canonical 32-byte nonce hex: the minimal form can drop to an ODD number of
 * hex chars (top nibble zero, ~1/16 of random nonces), which wallets reject
 * as an invalid `bytes` typed-data value. Padding once keeps the oracle
 * signature, the receiver's EIP-712 digest and the on-chain bytes identical.
 */
export function canonicalNonceHex(
  nonce: string | number | bigint | undefined | null,
): `0x${string}` {
  return zeroPadValue(toBeHex(BigInt(nonce ?? 0)), 32) as `0x${string}`;
}

export interface Eip712Domain {
  chainId: bigint;
  verifyingContract: `0x${string}`;
}

/** @deprecated Stale Aristotle verifier fallback — legacy test fixtures only; use an explicit domain. */
export const DEFAULT_EIP712_DOMAIN: Eip712Domain = {
  chainId: 16661n,
  verifyingContract: "0xDfbA9B8e3d63dFf3a1Fc21F2cCD2850285Dab943",
};

export function buildEip712Domain(
  chainId: number,
  verifyingContract: `0x${string}`,
): Eip712Domain {
  return {
    chainId: BigInt(chainId),
    verifyingContract,
  };
}

const PROOF_COMMON_FIELDS = [
  { name: "targetPubkey", type: "bytes" as const },
  { name: "to", type: "address" as const },
  { name: "nft", type: "address" as const },
  { name: "nonce", type: "bytes" as const },
  { name: "validUntil", type: "uint256" as const },
] as const;

export const ACCESS_PROOF_TYPES = {
  AccessProof: [
    { name: "dataHash", type: "bytes32" as const },
    ...PROOF_COMMON_FIELDS,
  ],
} as const;

const OWNERSHIP_PROOF_TYPES = {
  OwnershipProof: [
    { name: "dataHash", type: "bytes32" as const },
    { name: "sealedKey", type: "bytes" as const },
    ...PROOF_COMMON_FIELDS,
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

// Separators are pure per immutable domain; memoize (~60µs/op, ~16% of sign path), not re-hash each call.
const domainSeparatorCache = new WeakMap<Eip712Domain, Hex>();

function domainSeparator(domain?: Eip712Domain): Hex {
  const activeDomain = domain ?? DEFAULT_EIP712_DOMAIN;
  const cached = domainSeparatorCache.get(activeDomain);
  if (cached !== undefined) return cached;
  const separator = keccak256(
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
  domainSeparatorCache.set(activeDomain, separator);
  return separator;
}

export interface OwnershipProofInput {
  dataHash: Hex;
  sealedKey: Hex;
  targetPubkey: Hex;
  to: Hex;
  nft: Hex;
  nonce: Hex;
  validUntil: bigint;
}

export interface AccessProofInput {
  dataHash: Hex;
  targetPubkey: Hex;
  to: Hex;
  nft: Hex;
  nonce: Hex;
  validUntil: bigint;
}

function ownershipStructHash(input: OwnershipProofInput): Hex {
  return keccak256(
    abiCoder.encode(
      [
        "bytes32",
        "bytes32",
        "bytes32",
        "bytes32",
        "address",
        "address",
        "bytes32",
        "uint256",
      ],
      [
        OWNERSHIP_PROOF_TYPEHASH,
        input.dataHash,
        keccak256(input.sealedKey),
        keccak256(input.targetPubkey),
        input.to,
        input.nft,
        keccak256(input.nonce),
        input.validUntil,
      ],
    ),
  ) as Hex;
}

function accessStructHash(input: AccessProofInput): Hex {
  return keccak256(
    abiCoder.encode(
      [
        "bytes32",
        "bytes32",
        "bytes32",
        "address",
        "address",
        "bytes32",
        "uint256",
      ],
      [
        ACCESS_PROOF_TYPEHASH,
        input.dataHash,
        keccak256(input.targetPubkey),
        input.to,
        input.nft,
        keccak256(input.nonce),
        input.validUntil,
      ],
    ),
  ) as Hex;
}

function messageHash(structHash: Hex, domain?: Eip712Domain): Hex {
  return keccak256(
    concat(["0x1901", domainSeparator(domain), structHash]),
  ) as Hex;
}

export function ownershipMessageHash(
  input: OwnershipProofInput,
  domain?: Eip712Domain,
): Hex {
  return messageHash(ownershipStructHash(input), domain);
}

export function accessMessageHash(
  input: AccessProofInput,
  domain?: Eip712Domain,
): Hex {
  return messageHash(accessStructHash(input), domain);
}

function recoverSigner(signature: Hex, msgHash: Hex): Hex {
  const recovered = SigningKey.recoverPublicKey(getBytes(msgHash), signature);
  return computeAddress(recovered) as Hex;
}

export function recoverAccessSigner(
  signature: Hex,
  input: AccessProofInput,
  domain?: Eip712Domain,
): Hex {
  return recoverSigner(signature, accessMessageHash(input, domain));
}

export function recoverOwnershipSigner(
  signature: Hex,
  input: OwnershipProofInput,
  domain?: Eip712Domain,
): Hex {
  return recoverSigner(signature, ownershipMessageHash(input, domain));
}
