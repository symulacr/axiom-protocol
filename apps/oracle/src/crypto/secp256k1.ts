import { secp256k1 } from "ethereum-cryptography/secp256k1";
import { keccak256 } from "ethereum-cryptography/keccak";

/**
 * secp256k1 helpers for the Axiom oracle and backend.
 *
 * These mirror the on-chain `Utils.pubKeyToAddress` layout in
 * 0g-agent-nft/Utils.sol: `address(uint160(uint256(keccak256(pubKey))))`.
 */

/** Derive the uncompressed secp256k1 public key (64-byte X||Y, no 0x04 prefix). */
export function publicKeyUncompressedFromPrivate(privateKey: Uint8Array) {
  const pub = secp256k1.getPublicKey(privateKey, false);
  return pub.length === 65 ? pub.subarray(1) : pub;
}

/** Compute the Ethereum address from a 64-byte uncompressed public key. */
export function pubKeyToAddress(uncompressed: Uint8Array): `0x${string}` {
  if (uncompressed.length !== 64) throw new Error("Uncompressed pubkey must be 64 bytes (X||Y)");
  const hash = keccak256(new Uint8Array(uncompressed));
  return ("0x" + Buffer.from(hash).toString("hex").slice(-40)) as `0x${string}`;
}

/** Convenience: hex private key (with or without 0x prefix) -> 64-byte X||Y pubkey. */
export function deriveUncompressedPubkeyFromHex(privateKeyHex: string) {
  return publicKeyUncompressedFromPrivate(Uint8Array.from(Buffer.from(privateKeyHex.replace(/^0x/, ""), "hex")));
}
