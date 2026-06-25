import { z } from "zod";
import { validateHex, validateAddress, toViemHex } from "./hex.js";

/** Hex string with runtime validation + brand transform. */
export const hexString = z.string().regex(/^0x[a-fA-F0-9]+$/, "Invalid hex").transform((v) => validateHex(v));

/** Address (40-char hex) with brand transform. */
export const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address").transform((v) => validateAddress(v));

/** Viem-compatible hex string schema (outputs `0x${string}`). */
export const hexViem = hexString.transform((v) => toViemHex(v));

/** Viem-compatible address schema (outputs `0x${string}`). */
export const addressViem = address.transform((v) => toViemHex(v));
