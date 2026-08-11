import { Wallet } from "ethers";
import type { Hex } from "viem";

import { publicKeyUncompressedFromPrivate } from "@axiom/config/crypto/keys";
import {
  DEFAULT_EIP712_DOMAIN,
  accessMessageHash as eip712AccessMessageHash,
  ownershipMessageHash as eip712OwnershipMessageHash,
  recoverAccessSigner as eip712RecoverAccessSigner,
  type Eip712Domain,
  type OwnershipProofInput,
  type AccessProofInput,
} from "@axiom/config/eip712";


export const ownershipMessageHash = (
  input: OwnershipProofInput,
  domain: Eip712Domain = DEFAULT_EIP712_DOMAIN,
): Hex => eip712OwnershipMessageHash(input, domain);

export const accessMessageHash = (
  input: AccessProofInput,
  domain: Eip712Domain = DEFAULT_EIP712_DOMAIN,
): Hex => eip712AccessMessageHash(input, domain);

export class TeeSigner {
  readonly wallet: Wallet;
  readonly address: Hex;
  readonly uncompressedPubkey: Uint8Array;
  readonly privateKeyBytes: Uint8Array;
  readonly domain: Eip712Domain;

  constructor(
    privateKeyHex: string,
    domain: Eip712Domain = DEFAULT_EIP712_DOMAIN,
  ) {
    this.wallet = new Wallet(privateKeyHex);
    this.address = this.wallet.address as Hex;
    this.domain = domain;
    const priv = Uint8Array.from(
      Buffer.from(privateKeyHex.replace(/^0x/, ""), "hex"),
    );
    this.privateKeyBytes = priv;
    this.uncompressedPubkey = publicKeyUncompressedFromPrivate(priv);
  }

  signOwnership(input: OwnershipProofInput): Hex {
    const digest = ownershipMessageHash(input, this.domain);
    return this.wallet.signingKey.sign(digest).serialized as Hex;
  }

  recoverAccessSigner(signature: Hex, input: AccessProofInput): Hex {
    return eip712RecoverAccessSigner(signature, input, this.domain);
  }
}
