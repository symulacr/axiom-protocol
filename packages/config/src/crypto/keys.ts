import { encrypt, decrypt } from "eciesjs";
import { secp256k1 } from "ethereum-cryptography/secp256k1";
import { keccak256 } from "ethereum-cryptography/keccak";
// Noble utils only — importing ethers here would drag the full ethers library
// into every browser chunk that needs a key-derivation helper.
import { hexToBytes as hexToBytes_, toHex } from "ethereum-cryptography/utils";

export function publicKeyUncompressedFromPrivate(privateKey: Uint8Array) {
  const pub = secp256k1.getPublicKey(privateKey, false);
  return pub.length === 65 ? pub.subarray(1) : pub;
}

/** 0x-tolerant hex → bytes; odd-length input throws (same contract as the noble util). */
export function hexToBytes(hex: string): Uint8Array {
  const h = hex.replace(/^0x/, "");
  if (h.length % 2 !== 0) throw new Error("invalid hex");
  return hexToBytes_(h);
}

/** Browser-safe (atob, no Buffer/node:crypto) so consumers keep an ethers-free bundle. */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function normalizePubkey64(pk: `0x${string}`): `0x${string}` {
  if (pk.length === 130 && pk.startsWith("0x04")) {
    return ("0x" + pk.slice(4)) as `0x${string}`;
  }
  const pubBytes = hexToBytes(pk);
  if (pubBytes.length === 65) {
    return ("0x" + toHex(pubBytes.subarray(1))) as `0x${string}`;
  }
  return pk;
}

export function pubKeyToAddress(uncompressed: Uint8Array): `0x${string}` {
  if (uncompressed.length !== 64)
    throw new Error("Uncompressed pubkey must be 64 bytes (X||Y)");
  // keccak256 (noble) never mutates its input, so no defensive copy is needed.
  const hash = keccak256(uncompressed);
  return ("0x" + toHex(hash.subarray(12))) as `0x${string}`;
}

export function deriveUncompressedPubkeyFromHex(privateKeyHex: string) {
  return publicKeyUncompressedFromPrivate(
    Buffer.from(privateKeyHex.replace(/^0x/, ""), "hex"),
  );
}

function toCompressed(uncompressedOrFull: Uint8Array): Uint8Array {
  if (uncompressedOrFull.length === 33) return uncompressedOrFull;
  const full =
    uncompressedOrFull.length === 64
      ? Buffer.concat([new Uint8Array([0x04]), uncompressedOrFull])
      : uncompressedOrFull;
  if (full.length !== 65)
    throw new Error(
      "Pubkey must be 64 (X||Y) or 33 (compressed) or 65 (0x04||X||Y) bytes",
    );
  const point = secp256k1.ProjectivePoint.fromHex(full);
  return point.toRawBytes(true);
}

export function sealKeyForReceiver(
  receiverPubkey64: Uint8Array,
  dataEncryptionKey: Uint8Array,
) {
  return encrypt(toCompressed(receiverPubkey64), dataEncryptionKey);
}

export function unsealKeyForReceiver(
  receiverPrivateKey: Uint8Array,
  sealedKey: Uint8Array,
) {
  return decrypt(receiverPrivateKey, sealedKey);
}
