/** Shared EVM hex shapes: single source for every regex guarding a 0x value.
 *  Zod-free by design — browser bundles import from here; the zod schemas
 *  live in ./hex-schema.js (backend-only consumers). */
import { keccak256, toHex } from "viem";

export const HEX_REGEX = /^0x[a-fA-F0-9]+$/;
export const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
export const HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;

export type Hex = string & { readonly __brand: unique symbol };
export type Address = Hex & { readonly __address: unique symbol };

export function validateHex(value: string, label = "value"): Hex {
  if (!HEX_REGEX.test(value)) throw new Error(`Invalid hex ${label}: ${value}`);
  return value as Hex;
}

export function deriveMintDataHash(description: string): `0x${string}` {
  return keccak256(toHex(description.trim()));
}
