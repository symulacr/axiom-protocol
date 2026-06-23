import { toUtf8Bytes, keccak256, AbiCoder, concat, getBytes, SigningKey, computeAddress } from "ethers";
import type { Hex } from "viem";

/**
 * EIP-712 typed-data digest helpers for AxiomTeeVerifier.
 *
 * The on-chain verifier (apps/contracts/src/verifiers/AxiomTeeVerifier.sol)
 * switched from raw `keccak256(abi.encode(...))` to EIP-712 typed-data
 * digests in Wave 3-B. Every off-chain signer (TEE oracle, backend, receiver
 * wallet) MUST compute the identical digest or the on-chain `ECDSA.recover`
 * rejects the proof and every transfer reverts.
 *
 * Final digest (EIP-712, https://eips.ethereum.org/EIPS/eip-712):
 *   keccak256("\x19\x01" || domainSeparator || structHash)
 *
 * Per EIP-712 §Definition of hashStruct, `bytes` fields are pre-hashed to
 * `bytes32` via `keccak256`. Both this TypeScript module and the Solidity
 * verifier pre-hash `sealedKey` / `targetPubkey` before passing them to
 * `abi.encode`, ensuring identical struct hashes.
 */

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

/** EIP-712 domain: binds signatures to a specific chain + verifier contract. */
export interface Eip712Domain {
  /** EIP-155 chain id the proof will be verified on (e.g. 16602 = Galileo). */
  chainId: bigint;
  /** AxiomTeeVerifier contract address the proof will be verified against. */
  verifyingContract: `0x${string}`;
}

/**
 * Default domain for the Galileo testnet deployment. Used as the fallback
 * when a caller does not supply a domain (tests, devnet CLIs). Production
 * code MUST pass the real chain id + verifier address via env vars
 * (AXIOM_TEE_VERIFIER, AXIOM_CHAIN_ID) or explicitly via the domain parameter.
 */
export const DEFAULT_EIP712_DOMAIN: Eip712Domain = {
  chainId: 16602n,
  verifyingContract: "0x24f725198d64A3b03A8386cD8fa12BD7c591734A",
};

const abiCoder = AbiCoder.defaultAbiCoder();

/**
 * EIP-712 domain separator — `keccak256(abi.encode(EIP712Domain(...)))`.
 * Mirrors `AxiomTeeVerifier._domainSeparator()` exactly.
 */
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
  /// Unix-seconds deadline after which the proof is expired. Must be in the future
  /// and within `maxProofAgeSeconds` of the current block timestamp.
  validUntil: bigint;
}

export interface AccessProofInput {
  dataHash: Hex;
  targetPubkey: Hex;
  to: Hex;
  nft: Hex;
  nonce: bigint;
  /// Unix-seconds deadline after which the proof is expired.
  validUntil: bigint;
}

/**
 * EIP-712 OwnershipProof struct hash:
 *   keccak256(abi.encode(OWNERSHIP_PROOF_TYPEHASH, dataHash, sealedKey, targetPubkey, nonce, validUntil))
 * Matches `AxiomTeeVerifier.verifyTransferValidity` ownership leg.
 */
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

/**
 * EIP-712 AccessProof struct hash:
 *   keccak256(abi.encode(ACCESS_PROOF_TYPEHASH, dataHash, targetPubkey, nonce, validUntil))
 * Matches `AxiomTeeVerifier.verifyTransferValidity` access leg.
 */
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

/**
 * Full EIP-712 OwnershipProof digest:
 *   keccak256("\x19\x01" || domainSeparator || ownershipStructHash)
 * The TEE oracle signs this digest with raw ECDSA (signingKey.sign).
 */
export function ownershipMessageHash(input: OwnershipProofInput, domain: Eip712Domain): Hex {
  return keccak256(concat(["0x1901", domainSeparator(domain), ownershipStructHash(input)])) as Hex;
}

/**
 * Full EIP-712 AccessProof digest:
 *   keccak256("\x19\x01" || domainSeparator || accessStructHash)
 * The receiver signs this digest with raw ECDSA (signingKey.sign) — matching
 * the on-chain `ECDSA.recover(digest, sig)` with no EIP-191 prefix.
 */
export function accessMessageHash(input: AccessProofInput, domain: Eip712Domain): Hex {
  return keccak256(concat(["0x1901", domainSeparator(domain), accessStructHash(input)])) as Hex;
}

/**
 * Recover the signer of a raw-ECDSA AccessProof signature. The on-chain
 * verifier uses `ECDSA.recover(digest, sig)` (no EIP-191 prefix), so we
 * recover the public key directly from the EIP-712 digest.
 */
export function recoverAccessSigner(signature: Hex, input: AccessProofInput, domain: Eip712Domain): Hex {
  const recovered = SigningKey.recoverPublicKey(getBytes(accessMessageHash(input, domain)), signature);
  return computeAddress(recovered) as Hex;
}
