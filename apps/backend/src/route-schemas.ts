import { z } from "zod";
import { hexViem, addressViem } from "@axiom/config/types/schemas";

export const accessProofSchema = z.object({
  dataHash: hexViem,
  targetPubkey: hexViem,
  nonce: z.union([z.string(), z.number()]),
  proof: hexViem,
  validUntil: z.union([z.string(), z.number()]),
});

export const transferBodySchema = z.object({
  to: addressViem,
  receiverPubKey64: hexViem,
  accessProofNonce: z.union([z.string(), z.number()]).optional(),
  dataHash: hexViem.optional(),
  sealedKey: hexViem.optional(),
  oldDataEncryptionKey: z.string().optional(),
  oldDataUri: hexViem.optional(),
  accessProof: accessProofSchema.optional(),
});

export const paySchema = z.object({
  amount: z.string().min(1),
});

export const royaltySchema = z.object({
  bps: z.number().int().min(0).max(10000),
});

export const eventBodySchema = z.object({
  source: z.string().min(1),
  eventName: z.string().min(1),
  chainId: z.number(),
  blockNumber: z.number(),
  txHash: z.string().min(1),
  logIndex: z.number(),
  payload: z.record(z.string(), z.unknown()),
});

export const tickSchema = z.object({
  vault: addressViem,
  agentNft: addressViem,
  agentTokenId: z.string().regex(/^\d+$/),
  computeModel: z.string().optional(),
  strategy: z.string().optional(),
  signalSource: z.string().optional(),
  signalPayload: z.unknown().optional(),
  stream: z.boolean().optional(),
});

export const archiveLookupSchema = z.object({
  url: z.string().url(),
  limit: z.number().int().min(1).max(500).optional(),
});

export const archiveAccountSchema = z.object({
  handle: z.string().min(1).max(64),
  limit: z.number().int().min(1).max(500).optional(),
});

export const archiveConfirmSchema = z.object({
  url: z.string().url(),
});

export const archiveClosestSchema = z.object({
  url: z.string().url(),
  timestamp: z.string().optional(),
});

export const chatBodySchema = z.object({
  messages: z.array(z.any()).nonempty(),
  tools: z.array(z.any()).optional(),
});
