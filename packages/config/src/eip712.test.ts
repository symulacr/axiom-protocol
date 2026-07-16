import { test } from "node:test";
import assert from "node:assert/strict";
import { Wallet, getBytes, hexlify, randomBytes } from "ethers";
import type { Hex } from "viem";
import {
  recoverOwnershipSigner,
  recoverAccessSigner,
  ownershipMessageHash,
  accessMessageHash,
  DEFAULT_EIP712_DOMAIN,
  type OwnershipProofInput,
  type AccessProofInput,
  type Eip712Domain,
} from "./eip712.js";

function randomBytes32(): Hex {
  return hexlify(randomBytes(32)) as Hex;
}

function randomAddress(): Hex {
  return hexlify(randomBytes(20)) as Hex;
}

function makeOwnershipInput(): OwnershipProofInput {
  return {
    dataHash: randomBytes32(),
    sealedKey: hexlify(randomBytes(32)) as Hex,
    targetPubkey: hexlify(randomBytes(33)) as Hex,
    to: randomAddress(),
    nft: randomAddress(),
    nonce: 1n,
    validUntil: 9_999_999_999n,
  };
}

function makeAccessInput(): AccessProofInput {
  return {
    dataHash: randomBytes32(),
    targetPubkey: hexlify(randomBytes(33)) as Hex,
    to: randomAddress(),
    nft: randomAddress(),
    nonce: 2n,
    validUntil: 9_999_999_999n,
  };
}

/** Sign an EIP-712 digest exactly as the TEE oracle would (65-byte serialized sig). */
function signDigest(wallet: Wallet, digest: Hex): Hex {
  const sig = wallet.signingKey.sign(getBytes(digest));
  return sig.serialized as Hex;
}

test("recoverOwnershipSigner returns the TEE signer that produced the signature", () => {
  const signer = Wallet.createRandom();
  const input = makeOwnershipInput();
  const digest = ownershipMessageHash(input, DEFAULT_EIP712_DOMAIN);
  const signature = signDigest(signer, digest);

  const recovered = recoverOwnershipSigner(signature, input, DEFAULT_EIP712_DOMAIN);
  assert.equal(recovered.toLowerCase(), signer.address.toLowerCase());
});

test("recoverOwnershipSigner recovers with the default domain when no domain passed", () => {
  const signer = Wallet.createRandom();
  const input = makeOwnershipInput();
  const signature = signDigest(signer, ownershipMessageHash(input));

  const recovered = recoverOwnershipSigner(signature, input);
  assert.equal(recovered.toLowerCase(), signer.address.toLowerCase());
});

test("recoverOwnershipSigner discriminates: a different signer does NOT recover", () => {
  const signer = Wallet.createRandom();
  const impostor = Wallet.createRandom();
  const input = makeOwnershipInput();
  const signature = signDigest(signer, ownershipMessageHash(input, DEFAULT_EIP712_DOMAIN));

  const recovered = recoverOwnershipSigner(signature, input, DEFAULT_EIP712_DOMAIN);
  assert.notEqual(recovered.toLowerCase(), impostor.address.toLowerCase());
});

test("recoverOwnershipSigner is domain-bound: signature for another verifier does NOT recover under the default domain", () => {
  const signer = Wallet.createRandom();
  const altDomain: Eip712Domain = {
    chainId: 16602n,
    verifyingContract: "0x0000000000000000000000000000000000000001",
  };
  const input = makeOwnershipInput();
  const signature = signDigest(signer, ownershipMessageHash(input, altDomain));

  const recoveredUnderAlt = recoverOwnershipSigner(signature, input, altDomain);
  assert.equal(recoveredUnderAlt.toLowerCase(), signer.address.toLowerCase());

  const recoveredUnderDefault = recoverOwnershipSigner(signature, input, DEFAULT_EIP712_DOMAIN);
  assert.notEqual(recoveredUnderDefault.toLowerCase(), signer.address.toLowerCase());
});

test("recoverAccessSigner returns the signer that produced the access signature", () => {
  const signer = Wallet.createRandom();
  const input = makeAccessInput();
  const signature = signDigest(signer, accessMessageHash(input, DEFAULT_EIP712_DOMAIN));

  const recovered = recoverAccessSigner(signature, input, DEFAULT_EIP712_DOMAIN);
  assert.equal(recovered.toLowerCase(), signer.address.toLowerCase());
});

test("recoverAccessSigner discriminates: a different signer does NOT recover", () => {
  const signer = Wallet.createRandom();
  const impostor = Wallet.createRandom();
  const input = makeAccessInput();
  const signature = signDigest(signer, accessMessageHash(input, DEFAULT_EIP712_DOMAIN));

  const recovered = recoverAccessSigner(signature, input, DEFAULT_EIP712_DOMAIN);
  assert.notEqual(recovered.toLowerCase(), impostor.address.toLowerCase());
});
