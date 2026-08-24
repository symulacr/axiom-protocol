import { keccak256, toHex } from "viem";
import { z } from "zod";

/** Shared EVM hex shapes: single source for every regex guarding a 0x value. */
export const HEX_REGEX = /^0x[a-fA-F0-9]+$/;
export const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
export const HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;

export type Hex = string & { readonly __brand: unique symbol };
export type Address = Hex & { readonly __address: unique symbol };

export function validateHex(value: string, label = "value"): Hex {
  if (!HEX_REGEX.test(value)) throw new Error(`Invalid hex ${label}: ${value}`);
  return value as Hex;
}

function validateAddress(value: string, label = "address"): Address {
  if (!ADDRESS_REGEX.test(value))
    throw new Error(`Invalid address ${label}: ${value}`);
  return value as Address;
}

function toViemHex(h: Hex): `0x${string}` {
  return h as `0x${string}`;
}

export const hexString = z
  .string()
  .regex(HEX_REGEX, "Invalid hex")
  .transform((v) => validateHex(v));

export const address = z
  .string()
  .regex(ADDRESS_REGEX, "Invalid address")
  .transform((v) => validateAddress(v));

export const hexViem = hexString.transform((v) => toViemHex(v));

export const addressViem = address.transform((v) => toViemHex(v));

/** Canonical mint dataHash: keccak256(toHex(trimmed description)). The UI wizard
 *  and chat mint_agent MUST derive identically — the oracle only signs hashes it has seen. */
export function deriveMintDataHash(description: string): `0x${string}` {
  return keccak256(toHex(description.trim()));
}
