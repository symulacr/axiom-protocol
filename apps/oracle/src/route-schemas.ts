import { z } from "zod";
import { validateHex, validateAddress, toViemHex } from "@axiom/config/types/hex";

/** Hex string Zod schema that outputs `0x${string}` (viem-compatible). */
const hexViem = z.string().regex(/^0x[a-fA-F0-9]+$/, "Invalid hex").transform((v) => toViemHex(validateHex(v)));

/** Address Zod schema that outputs `0x${string}` (viem-compatible). */
const addressViem = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address").transform((v) => toViemHex(validateAddress(v)));

export const transferValiditySchema = z.object({
  oldDataHash: hexViem,
  oldDataUri: hexViem,
  targetPubkey64: hexViem,
  accessProofNonce: z.number(),
  ownershipProofNonce: z.number(),
  oldDataEncryptionKey: z.string(),
  to: addressViem.optional(),
  nft: addressViem.optional(),
});

export const ownershipBodySchema = z.object({
  dataHash: hexViem,
  targetPubkey: hexViem,
  sealedKey: hexViem,
  nonce: z.number(),
  to: addressViem,
  nft: addressViem,
  validUntil: z.union([z.string(), z.number(), z.bigint()]).optional(),
});

export const mintDataHashSchema = z.object({
  dataHash: hexViem,
});
