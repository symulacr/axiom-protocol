import { toUtf8Bytes, keccak256, AbiCoder, concat, getBytes, SigningKey, computeAddress } from "ethers";
import type { Hex } from "viem";
import {
  type Eip712Domain,
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
  ACCESS_PROOF_TYPES,
  OWNERSHIP_PROOF_TYPES,
} from "@axiom/config/eip712";

export { DEFAULT_EIP712_DOMAIN } from "@axiom/config/eip712";
export type { Eip712Domain } from "@axiom/config/eip712";

// ---------------------------------------------------------------------------
// Helpers to build EIP-712 struct type strings from the canonical schemas.
// ---------------------------------------------------------------------------

function eip712TypeString(typeName: string, fields: ReadonlyArray<{ name: string; type: string }>): string {
  return `${typeName}(${fields.map((f) => `${f.type} ${f.name}`).join(",")})`;
}

const EIP712_DOMAIN_TYPEHASH = keccak256(
  toUtf8Bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
);
const OWNERSHIP_PROOF_TYPEHASH = keccak256(
  toUtf8Bytes(eip712TypeString("OwnershipProof", OWNERSHIP_PROOF_TYPES.OwnershipProof)),
);
const ACCESS_PROOF_TYPEHASH = keccak256(
  toUtf8Bytes(eip712TypeString("AccessProof", ACCESS_PROOF_TYPES.AccessProof)),
);

const VERIFIER_NAME_HASH = keccak256(toUtf8Bytes(EIP712_DOMAIN_NAME));
const VERIFIER_VERSION_HASH = keccak256(toUtf8Bytes(EIP712_DOMAIN_VERSION));

const abiCoder = AbiCoder.defaultAbiCoder();

/** EIP-712 domain separator — keccak256(abi.encode(EIP712Domain(...))). Mirrors AxiomTeeVerifier._domainSeparator(). */
export function domainSeparator(domain: Eip712Domain): Hex {
  return keccak256(
    abiCoder.encode(
      ["bytes32", "bytes32", "bytes32", "uint256", "address"],
      [EIP712_DOMAIN_TYPEHASH, VERIFIER_NAME_HASH, VERIFIER_VERSION_HASH, domain.chainId, domain.verifyingContract],
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

export function ownershipStructHash(input: OwnershipProofInput): Hex {
  return keccak256(
    abiCoder.encode(
      ["bytes32", "bytes32", "bytes32", "bytes32", "address", "address", "uint256", "uint256"],
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
      ["bytes32", "bytes32", "bytes32", "address", "address", "uint256", "uint256"],
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
export function ownershipMessageHash(input: OwnershipProofInput, domain: Eip712Domain): Hex {
  return keccak256(concat(["0x1901", domainSeparator(domain), ownershipStructHash(input)])) as Hex;
}

/** Full EIP-712 AccessProof digest (signed by receiver). */
export function accessMessageHash(input: AccessProofInput, domain: Eip712Domain): Hex {
  return keccak256(concat(["0x1901", domainSeparator(domain), accessStructHash(input)])) as Hex;
}

/** Recover the signer of a raw-ECDSA AccessProof signature. */
export function recoverAccessSigner(signature: Hex, input: AccessProofInput, domain: Eip712Domain): Hex {
  const recovered = SigningKey.recoverPublicKey(getBytes(accessMessageHash(input, domain)), signature);
  return computeAddress(recovered) as Hex;
}
