import { z } from "zod";
import {
  validateHex,
  validateAddress,
  toViemHex,
  HEX_REGEX,
  ADDRESS_REGEX,
} from "./hex.js";

/** Hex string with runtime validation + brand transform. */
export const hexString = z
  .string()
  .regex(HEX_REGEX, "Invalid hex")
  .transform((v) => validateHex(v));

/** Address (40-char hex) with brand transform. */
export const address = z
  .string()
  .regex(ADDRESS_REGEX, "Invalid address")
  .transform((v) => validateAddress(v));

/** Viem-compatible hex string schema (outputs `0x${string}`). */
export const hexViem = hexString.transform((v) => toViemHex(v));

/** Viem-compatible address schema (outputs `0x${string}`). */
export const addressViem = address.transform((v) => toViemHex(v));
