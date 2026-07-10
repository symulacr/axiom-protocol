import { encrypt, decrypt } from "eciesjs";
import { secp256k1 } from "ethereum-cryptography/secp256k1";


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
