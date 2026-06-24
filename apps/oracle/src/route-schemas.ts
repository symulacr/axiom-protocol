import { z } from "zod";
import { hexViem, addressViem } from "@axiom/config/types/schemas";

export const transferValiditySchema = z.object({
  oldDataHash: hexViem,
  oldDataUri: hexViem,
  targetPubkey64: hexViem,
  accessProofNonce: z.union([z.string(), z.number()]),
  ownershipProofNonce: z.union([z.string(), z.number()]).optional(),
  oldDataEncryptionKey: z.string(),
  to: addressViem.optional(),
  nft: addressViem.optional(),
});

export const ownershipBodySchema = z.object({
  dataHash: hexViem,
  targetPubkey: hexViem,
  sealedKey: hexViem,
  nonce: z.union([z.string(), z.number()]),
  to: addressViem,
  nft: addressViem,
  validUntil: z.union([z.string(), z.number(), z.bigint()]).optional(),
});

export const mintDataHashSchema = z.object({
  dataHash: hexViem,
});
