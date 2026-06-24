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

/** EIP-712 OwnershipProof digest (signed by TEE oracle with raw ECDSA). */
export function ownershipMessageHash(input: OwnershipProofInput, domain: Eip712Domain = DEFAULT_EIP712_DOMAIN): Hex {
  return eip712OwnershipMessageHash(input, domain);
}

/** EIP-712 AccessProof digest (signed by receiver with raw ECDSA). */
export function accessMessageHash(input: AccessProofInput, domain: Eip712Domain = DEFAULT_EIP712_DOMAIN): Hex {
  return eip712AccessMessageHash(input, domain);
}

/** Recover the signer of a raw-ECDSA AccessProof signature (no EIP-191 prefix). */
export function recoverAccessSigner(
  signature: Hex,
  input: AccessProofInput,
  domain: Eip712Domain = DEFAULT_EIP712_DOMAIN,
): Hex {
  return eip712RecoverAccessSigner(signature, input, domain);
}

/**
 * TEE signer service holding a secp256k1 keypair for EIP-712 typed-data signing.
 * In production the key would live in Intel TDX / AMD SEV; here it's a cleartext Node process for devnet.
 *
 * The domain binds signatures to a specific AxiomTeeVerifier deployment to prevent replay.
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

  /** Sign an OwnershipProof payload. Returns a 65-byte (r || s || v) signature. */
  signOwnership(input: OwnershipProofInput): Hex {
    const digest = ownershipMessageHash(input, this.domain);
    return this.wallet.signingKey.sign(digest).serialized as Hex;
  }

  /** Recover the signer of an AccessProof payload via raw ECDSA. */
  recoverAccessSigner(signature: Hex, input: AccessProofInput): Hex {
    const digest = accessMessageHash(input, this.domain);
    const recovered = SigningKey.recoverPublicKey(getBytes(digest), signature);
    return computeAddress(recovered) as Hex;
  }
}
