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

export const royaltySchema = z.object({
  bps: z.number().int().min(0).max(10000),
});

/** Native OG amount for vault deposit (ether string, e.g. "0.001"). */
export const vaultDepositEncodeSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d+)?$/),
});

/** Native OG amount for vault withdraw (ether string, e.g. "0.001"). */
export const vaultWithdrawEncodeSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d+)?$/),
});

export const eventBodySchema = z.object({
  source: z.string().min(1),
  eventName: z.string().min(1),
  chainId: z.number().int().positive(),
  blockNumber: z.number().int().nonnegative(),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  logIndex: z.number().int().nonnegative(),
  payload: z.record(z.string(), z.unknown()),
});

export const vaultExecuteSchema = z.object({
  target: addressViem,
  value: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]),
  data: hexViem,
  proof: z.array(hexViem),
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
  limit: z.coerce.number().int().min(1).max(500).optional(),
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

const chatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.union([z.string(), z.null()]).optional(),
  tool_calls: z
    .array(
      z.object({
        id: z.string(),
        type: z.literal("function").optional(),
        function: z.object({
          name: z.string(),
          arguments: z.string(),
        }),
      }),
    )
    .optional(),
  tool_call_id: z.string().optional(),
  name: z.string().optional(),
});

export const chatBodySchema = z.object({
  messages: z.array(chatMessageSchema).nonempty(),
  tools: z.array(z.any()).optional(),
  model: z.string().optional(),
  stream: z.boolean().optional(),
});
