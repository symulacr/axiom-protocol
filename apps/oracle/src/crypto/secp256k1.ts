import { secp256k1 } from "ethereum-cryptography/secp256k1";
import { keccak256 } from "ethereum-cryptography/keccak";

/**
 * secp256k1 helpers for the Axiom oracle and backend.
 *
 * These mirror the on-chain `Utils.pubKeyToAddress` layout in
 * 0g-agent-nft/Utils.sol: `address(uint160(uint256(keccak256(pubKey))))`.
 */

export function publicKeyUncompressedFromPrivate(privateKey: Uint8Array) {
  const pub = secp256k1.getPublicKey(privateKey, false);
  return pub.length === 65 ? pub.subarray(1) : pub;
}

export function pubKeyToAddress(uncompressed: Uint8Array): `0x${string}` {
  if (uncompressed.length !== 64) throw new Error("Uncompressed pubkey must be 64 bytes (X||Y)");
  const hash = keccak256(new Uint8Array(uncompressed));
  return ("0x" + Buffer.from(hash).toString("hex").slice(-40)) as `0x${string}`;
}

export function deriveUncompressedPubkeyFromHex(privateKeyHex: string) {
  return publicKeyUncompressedFromPrivate(Uint8Array.from(Buffer.from(privateKeyHex.replace(/^0x/, ""), "hex")));
}
