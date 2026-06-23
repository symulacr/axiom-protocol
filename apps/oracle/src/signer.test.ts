import { test } from "node:test";
import assert from "node:assert/strict";
import { SigningKey, computeAddress, Wallet, getBytes } from "ethers";

import { pubKeyToAddress, publicKeyUncompressedFromPrivate } from "./crypto/secp256k1.js";
import { sealKeyForReceiver, unsealKeyForReceiver } from "./crypto/ecies.js";
import { aesGcmDecrypt, aesGcmEncrypt, concatEncrypted, parseEncrypted } from "./crypto/aes-gcm.js";
import { TeeSigner, ownershipMessageHash, accessMessageHash } from "./signer.js";

const TEST_PRIV_HEX = "0x" + "11".repeat(32);
const TEST_RECEIVER_PRIV_HEX = "0x" + "22".repeat(32);

function expectEqualUint8Array(actual: Uint8Array, expected: Uint8Array, msg?: string) {
  assert.equal(actual.length, expected.length, `${msg ?? "length"} mismatch: ${actual.length} vs ${expected.length}`);
  for (let i = 0; i < actual.length; i++) {
    assert.equal(actual[i], expected[i], `${msg ?? "byte"} ${i} mismatch`);
  }
}

test("AES-256-GCM roundtrip preserves plaintext", () => {
  const key = new Uint8Array(32).fill(0x07);
  const plaintext = new TextEncoder().encode("Axiom Protocol — secret agent intelligence");
  const enc = aesGcmEncrypt(key, plaintext);
  const blob = concatEncrypted(enc);
  assert.equal(blob.length, 12 + plaintext.length + 16, "blob = iv || ct || tag");
  const dec = aesGcmDecrypt(key, parseEncrypted(blob));
  expectEqualUint8Array(dec, plaintext, "decrypted plaintext");
});

test("AES-256-GCM detects tampering via auth tag", () => {
  const key = new Uint8Array(32).fill(0x07);
  const enc = aesGcmEncrypt(key, new Uint8Array([1, 2, 3, 4]));
  const blob = concatEncrypted(enc);
  blob[20] ^= 0xff;
  assert.throws(() => aesGcmDecrypt(key, parseEncrypted(blob)));
});

test("pubKeyToAddress matches on-chain Utils.pubKeyToAddress", () => {
  const priv = Uint8Array.from(Buffer.from(TEST_PRIV_HEX.replace(/^0x/, ""), "hex"));
  const uncompressed = publicKeyUncompressedFromPrivate(priv);
  assert.equal(uncompressed.length, 64, "uncompressed pubkey is 64 bytes (X||Y)");
  const address = pubKeyToAddress(uncompressed);
  assert.match(address, /^0x[0-9a-f]{40}$/);
});

test("ECIES sealKeyForReceiver → unsealKeyForReceiver roundtrip", () => {
  const receiverPriv = Uint8Array.from(Buffer.from(TEST_RECEIVER_PRIV_HEX.replace(/^0x/, ""), "hex"));
  const receiverPubkey = publicKeyUncompressedFromPrivate(receiverPriv);
  const dataKey = new Uint8Array(32);
  for (let i = 0; i < 32; i++) dataKey[i] = i;
  const sealed = sealKeyForReceiver(receiverPubkey, dataKey);
  const unsealed = unsealKeyForReceiver(receiverPriv, sealed);
  expectEqualUint8Array(unsealed, dataKey, "unsealed data key");
});

test("TeeSigner.signOwnership produces 65-byte raw signature recoverable by ethers", () => {
  const signer = new TeeSigner(TEST_PRIV_HEX);
  const input = {
    dataHash: ("0x" + "11".repeat(32)) as `0x${string}`,
    sealedKey: ("0x" + "22".repeat(32)) as `0x${string}`,
    targetPubkey: ("0x" + "33".repeat(64)) as `0x${string}`,
    nonce: 42n,
    validUntil: 99999999999n,
  };
  const sig = signer.signOwnership(input);
  assert.match(sig, /^0x[0-9a-fA-F]+$/);
  assert.equal((sig.length - 2) / 2, 65, "signature is 65 bytes (r || s || v)");

  // Recovery: use the SAME input that was signed so the recovered pubkey matches.
  const digest = ownershipMessageHash(input);
  const recoveredHex = SigningKey.recoverPublicKey(digest, sig);
  // ethers' SigningKey.recoverPublicKey returns the 65-byte uncompressed form (0x04 || X || Y).
  const recoveredBytes = Uint8Array.from(Buffer.from(recoveredHex.slice(2), "hex"));
  assert.equal(recoveredBytes.length, 65, "recovered pubkey is 65 bytes (0x04 + X + Y)");
  const recoveredUncompressed = recoveredBytes.slice(1); // strip 0x04 → 64 bytes X||Y
  const recoveredAddress = pubKeyToAddress(recoveredUncompressed);
  assert.equal(recoveredAddress.toLowerCase(), signer.address.toLowerCase());
});

test("TeeSigner.recoverAccessSigner recovers a raw-ECDSA AccessProof", async () => {
  const signer = new TeeSigner(TEST_PRIV_HEX);
  const receiver = new Wallet(TEST_RECEIVER_PRIV_HEX);

  const input = {
    dataHash: ("0x" + "11".repeat(32)) as `0x${string}`,
    targetPubkey: ("0x" + "33".repeat(64)) as `0x${string}`,
    nonce: 7n,
    validUntil: 99999999999n,
  };
  // Raw ECDSA over the digest — no EIP-191 prefix, matching the on-chain ecrecover.
  const digest = accessMessageHash(input);
  const sig = receiver.signingKey.sign(getBytes(digest)).serialized;

  const recovered = signer.recoverAccessSigner(sig, input);
  assert.equal(recovered.toLowerCase(), receiver.address.toLowerCase());

  // Sanity: direct raw-ECDSA recovery gives the same answer.
  const directRecovered = computeAddress(SigningKey.recoverPublicKey(getBytes(digest), sig));
  assert.equal(directRecovered.toLowerCase(), recovered.toLowerCase());
});
