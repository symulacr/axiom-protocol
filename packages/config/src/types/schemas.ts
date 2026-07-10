import { z } from "zod";
import {
  validateHex,
  validateAddress,
  toViemHex,
  HEX_REGEX,
  ADDRESS_REGEX,
} from "./hex.js";

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
