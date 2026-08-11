import { z } from "zod";
import { hexViem, addressViem } from "@axiom/config/types/hex";

export const transferValiditySchema = z.object({
  oldDataHash: hexViem,
  oldDataUri: hexViem,
  targetPubkey64: hexViem,
  accessProofNonce: z.union([z.string(), z.number()]),
  ownershipProofNonce: z.union([z.string(), z.number()]).optional(),
  oldDataEncryptionKey: z.string().optional(),
  sealedDataEncryptionKey: z.string().optional(), // ECIES-sealed 32-byte DEK to oracle TEE pubkey (preferred over cleartext)
  to: addressViem,
  nft: addressViem,
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
