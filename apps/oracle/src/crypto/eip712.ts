import { toUtf8Bytes, keccak256, AbiCoder, concat, getBytes, SigningKey, computeAddress } from "ethers";
import type { Hex } from "viem";

const EIP712_DOMAIN_TYPEHASH = keccak256(
  toUtf8Bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
);
const OWNERSHIP_PROOF_TYPEHASH = keccak256(
  toUtf8Bytes("OwnershipProof(bytes32 dataHash,bytes sealedKey,bytes targetPubkey,address to,address nft,uint256 nonce,uint256 validUntil)"),
);
const ACCESS_PROOF_TYPEHASH = keccak256(
  toUtf8Bytes("AccessProof(bytes32 dataHash,bytes targetPubkey,address to,address nft,uint256 nonce,uint256 validUntil)"),
);

const VERIFIER_NAME_HASH = keccak256(toUtf8Bytes("AxiomTeeVerifier"));
const VERIFIER_VERSION_HASH = keccak256(toUtf8Bytes("1"));

/** EIP-712 domain: binds signatures to specific chain + verifier contract. */
export interface Eip712Domain {
  chainId: bigint;
  verifyingContract: `0x${string}`;
}

/** Default domain for Galileo testnet. Production MUST pass real chain id + verifier address. */
export const DEFAULT_EIP712_DOMAIN: Eip712Domain = {
  chainId: 16602n,
  verifyingContract: "0x24f725198d64A3b03A8386cD8fa12BD7c591734A",
};

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
