import { z } from "zod";

const HEX_REGEX = /^0x[a-fA-F0-9]+$/;
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

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
