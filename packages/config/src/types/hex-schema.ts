import { z } from "zod";

import { ADDRESS_REGEX, HEX_REGEX, validateHex } from "./hex.js";

function toViemHex(h: string): `0x${string}` {
  return h as `0x${string}`;
}

function validateAddress(value: string, label = "address") {
  if (!ADDRESS_REGEX.test(value))
    throw new Error(`Invalid address ${label}: ${value}`);
  return value;
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
