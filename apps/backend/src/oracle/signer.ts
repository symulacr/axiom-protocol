import { Wallet } from "ethers";
import type { Hex } from "viem";

import { publicKeyUncompressedFromPrivate } from "@axiom/config/crypto/keys";
import {
  ownershipMessageHash as eip712OwnershipMessageHash,
  recoverAccessSigner as eip712RecoverAccessSigner,
  type Eip712Domain,
  type OwnershipProofInput,
  type AccessProofInput,
} from "@axiom/config/eip712";

export class TeeSigner {
  readonly wallet: Wallet;
  readonly address: Hex;
  readonly uncompressedPubkey: Uint8Array;
  readonly privateKeyBytes: Uint8Array;
  readonly domain: Eip712Domain;

  constructor(
    privateKeyHex: string,
    domain: Eip712Domain,
    configuredChainId?: number,
  ) {
    // A silently stale hardcoded domain would sign against the wrong network.
    if (
      configuredChainId !== undefined &&
      domain.chainId !== BigInt(configuredChainId)
    ) {
      throw new Error(
        `EIP-712 domain chainId ${domain.chainId} ≠ configured chain ${configuredChainId}`,
      );
    }
    this.wallet = new Wallet(privateKeyHex);
    this.address = this.wallet.address as Hex;
    this.domain = domain;
    this.privateKeyBytes = Buffer.from(privateKeyHex.replace(/^0x/, ""), "hex");
    this.uncompressedPubkey = publicKeyUncompressedFromPrivate(
      this.privateKeyBytes,
    );
  }

  signOwnership(input: OwnershipProofInput): Hex {
    const digest = eip712OwnershipMessageHash(input, this.domain);
    return this.wallet.signingKey.sign(digest).serialized as Hex;
  }

  recoverAccessSigner(signature: Hex, input: AccessProofInput): Hex {
    return eip712RecoverAccessSigner(signature, input, this.domain);
  }
}
