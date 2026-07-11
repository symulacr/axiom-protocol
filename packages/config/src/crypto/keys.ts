import { encrypt, decrypt } from "eciesjs";
import { secp256k1 } from "ethereum-cryptography/secp256k1";
import { keccak256 } from "ethereum-cryptography/keccak";

export function publicKeyUncompressedFromPrivate(privateKey: Uint8Array) {
  const pub = secp256k1.getPublicKey(privateKey, false);
  return pub.length === 65 ? pub.subarray(1) : pub;
}

export function pubKeyToAddress(uncompressed: Uint8Array): `0x${string}` {
  if (uncompressed.length !== 64)
    throw new Error("Uncompressed pubkey must be 64 bytes (X||Y)");
  const hash = keccak256(new Uint8Array(uncompressed));
  return ("0x" + Buffer.from(hash).toString("hex").slice(-40)) as `0x${string}`;
}

export function deriveRawPubkeyFromHex(privateKeyHex: string) {
  return publicKeyUncompressedFromPrivate(
    Uint8Array.from(Buffer.from(privateKeyHex.replace(/^0x/, ""), "hex")),
  );
}

export const deriveUncompressedPubkeyFromHex = deriveRawPubkeyFromHex;

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
