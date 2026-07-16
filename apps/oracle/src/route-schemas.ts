import { z } from "zod";
import { hexViem, addressViem } from "@axiom/config/types/hex";

export const transferValiditySchema = z.object({
  oldDataHash: hexViem,
  oldDataUri: hexViem,
  targetPubkey64: hexViem,
  accessProofNonce: z.union([z.string(), z.number()]),
  ownershipProofNonce: z.union([z.string(), z.number()]).optional(),
  /** @deprecated cleartext; only when AXIOM_ALLOW_CLEARTEXT_DEK=true and non-production */
  oldDataEncryptionKey: z.string().optional(),
  /** ECIES-sealed 32-byte DEK to oracle TEE pubkey (preferred) */
  sealedDataEncryptionKey: z.string().optional(),
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
