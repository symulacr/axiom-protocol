import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM symmetric encryption (Node crypto, no mocks).
 * Output layout: iv (12 bytes) || ciphertext || authTag (16 bytes).
 *
 * Canonical sources (per the constraint to cite MDN/ECMA-262/Node/0G/EIP only):
 *   - https://nodejs.org/api/crypto.html#ciphercreatecipherivalgorithm-key-iv-options
 *   - https://nodejs.org/api/crypto.html#ciphergetauthtag
 */
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export interface EncryptedPayload {
  iv: Uint8Array;
  ciphertext: Uint8Array;
  authTag: Uint8Array;
}

export function aesGcmEncrypt(key: Uint8Array, plaintext: Uint8Array): EncryptedPayload {
  if (key.length !== 32) throw new Error("AES-256-GCM requires a 32-byte key");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const enc1 = cipher.update(plaintext);
  const enc2 = cipher.final();
  const ciphertext = new Uint8Array(enc1.length + enc2.length);
  ciphertext.set(enc1, 0);
  ciphertext.set(enc2, enc1.length);
  const authTag = new Uint8Array(cipher.getAuthTag());
  return { iv, ciphertext, authTag };
}

export function aesGcmDecrypt(key: Uint8Array, payload: EncryptedPayload): Uint8Array {
  if (key.length !== 32) throw new Error("AES-256-GCM requires a 32-byte key");
  const decipher = createDecipheriv(ALGORITHM, key, payload.iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(payload.authTag);
  const dec1 = decipher.update(payload.ciphertext);
  const dec2 = decipher.final();
  const out = new Uint8Array(dec1.length + dec2.length);
  out.set(dec1, 0);
  out.set(dec2, dec1.length);
  return out;
}

export function concatEncrypted(payload: EncryptedPayload) {
  return new Uint8Array([...payload.iv, ...payload.ciphertext, ...payload.authTag]);
}

export function parseEncrypted(blob: Uint8Array) {
  if (blob.length < IV_LENGTH + AUTH_TAG_LENGTH) throw new Error("Encrypted blob too short");
  const iv = blob.subarray(0, IV_LENGTH);
  const authTag = blob.subarray(blob.length - AUTH_TAG_LENGTH);
  const ciphertext = blob.subarray(IV_LENGTH, blob.length - AUTH_TAG_LENGTH);
  return { iv, ciphertext, authTag };
}
