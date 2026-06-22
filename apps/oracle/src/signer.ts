import { Wallet, SigningKey, computeAddress, getBytes } from "ethers";
import type { Hex } from "viem";

import { publicKeyUncompressedFromPrivate } from "./crypto/secp256k1.js";
import {
  DEFAULT_EIP712_DOMAIN,
  accessMessageHash as eip712AccessMessageHash,
  ownershipMessageHash as eip712OwnershipMessageHash,
  recoverAccessSigner as eip712RecoverAccessSigner,
  type Eip712Domain,
  type OwnershipProofInput,
  type AccessProofInput,
} from "./crypto/eip712.js";

export { pubKeyToAddress, deriveUncompressedPubkeyFromHex } from "./crypto/secp256k1.js";
export {
  DEFAULT_EIP712_DOMAIN,
  domainSeparator,
  ownershipStructHash,
  accessStructHash,
  type Eip712Domain,
  type OwnershipProofInput,
  type AccessProofInput,
} from "./crypto/eip712.js";

export interface OwnershipProofResult {
  newDataUri: Hex;
  newDataHash: Hex;
  sealedKey: Hex;
  ownershipSignature: Hex;
  accessProofNonce?: number;
  ownershipProofNonce?: number;
}

/**
 * EIP-712 OwnershipProof digest:
 *   keccak256("\x19\x01" || domainSeparator || ownershipStructHash)
 * The TEE oracle signs this with raw ECDSA (signingKey.sign).
 */
export function ownershipMessageHash(input: OwnershipProofInput, domain: Eip712Domain = DEFAULT_EIP712_DOMAIN): Hex {
  return eip712OwnershipMessageHash(input, domain);
}

/**
 * EIP-712 AccessProof digest:
 *   keccak256("\x19\x01" || domainSeparator || accessStructHash)
 * The receiver signs this with raw ECDSA (signingKey.sign) — matching the
 * on-chain `ECDSA.recover(digest, sig)` with no EIP-191 prefix.
 */
export function accessMessageHash(input: AccessProofInput, domain: Eip712Domain = DEFAULT_EIP712_DOMAIN): Hex {
  return eip712AccessMessageHash(input, domain);
}

/**
 * Recover the signer of a raw-ECDSA AccessProof signature. The on-chain
 * verifier uses `ECDSA.recover(digest, sig)` (no EIP-191 prefix), so we
 * recover the public key directly from the EIP-712 digest.
 */
export function recoverAccessSigner(
  signature: Hex,
  input: AccessProofInput,
  domain: Eip712Domain = DEFAULT_EIP712_DOMAIN,
): Hex {
  return eip712RecoverAccessSigner(signature, input, domain);
}

/**
 * Pure-ESM TEE signer service. Holds a secp256k1 keypair whose address is registered
 * on-chain in AxiomTeeVerifier. In production, the private key would live in an Intel
 * TDX / AMD SEV TEE; here we use a node process with a cleartext private key for devnet.
 *
 * The on-chain verifier (AxiomTeeVerifier.sol, Wave 3-B) checks EIP-712 typed-data
 * digests (https://eips.ethereum.org/EIPS/eip-712):
 *   - OwnershipProof.proof: raw ECDSA signature over the EIP-712 OwnershipProof
 *     digest (domain-bound). The TEE signer produces this via signingKey.sign(digest).
 *   - AccessProof.proof: raw ECDSA signature over the EIP-712 AccessProof digest
 *     (domain-bound). The receiver signs with raw ECDSA (no EIP-191 prefix),
 *     matching the on-chain `ECDSA.recover(digest, sig)`.
 *
 * The `domain` (chain id + verifying contract address) binds every signature to a
 * specific AxiomTeeVerifier deployment, preventing cross-chain/cross-contract replay.
 * It defaults to the Galileo testnet deployment; production MUST pass the real domain.
 *
 * The `validUntil` deadline field follows the EIP-712 typed-data pattern. The verifier
 * rejects any proof where `block.timestamp > validUntil` (expired) or where
 * `validUntil - block.timestamp > maxProofAgeSeconds` (too far in the future).
 */
export class TeeSigner {
  readonly wallet: Wallet;
  readonly address: Hex;
  readonly uncompressedPubkey: Uint8Array;
  readonly domain: Eip712Domain;

  constructor(privateKeyHex: string, domain: Eip712Domain = DEFAULT_EIP712_DOMAIN) {
    this.wallet = new Wallet(privateKeyHex);
    this.address = this.wallet.address as Hex;
    this.domain = domain;
    const priv = Uint8Array.from(Buffer.from(privateKeyHex.replace(/^0x/, ""), "hex"));
    this.uncompressedPubkey = publicKeyUncompressedFromPrivate(priv);
  }

  /**
   * Sign an OwnershipProof payload. Returns a 65-byte signature (r || s || v) suitable
   * for the on-chain `OwnershipProof.proof` field. The digest is the EIP-712
   * OwnershipProof digest bound to this signer's domain.
   */
  signOwnership(input: OwnershipProofInput): Hex {
    const digest = ownershipMessageHash(input, this.domain);
    return this.wallet.signingKey.sign(digest).serialized as Hex;
  }

  /**
   * Recover the signer of an AccessProof payload via raw ECDSA, matching the
   * on-chain `ECDSA.recover` over the EIP-712 AccessProof digest (no EIP-191 prefix).
   */
  recoverAccessSigner(signature: Hex, input: AccessProofInput): Hex {
    const digest = accessMessageHash(input, this.domain);
    const recovered = SigningKey.recoverPublicKey(getBytes(digest), signature);
    return computeAddress(recovered) as Hex;
  }
}
