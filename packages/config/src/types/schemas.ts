import { z } from "zod";
import { validateHex, validateAddress, type Hex, type Address } from "./hex.js";

/** Hex string with runtime validation + brand transform. */
export const hexString = z.string().regex(/^0x[a-fA-F0-9]+$/, "Invalid hex").transform((v) => validateHex(v));

/** Address (40-char hex) with brand transform. */
export const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address").transform((v) => validateAddress(v));

/** bytes32 (64-char hex). */
export const bytes32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid bytes32").transform((v) => validateHex(v));

/** Generic fetch + validate. */
export async function fetchAndValidate<T>(url: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const raw = await res.json();
  return schema.parse(raw);
}
