import { keccak256, toHex } from "viem";

/** Zod-free module: safe to import from browser bundles (types/hex pulls zod). */
export function deriveMintDataHash(description: string): `0x${string}` {
  return keccak256(toHex(description.trim()));
}
