import { z } from "zod";
import { hexViem, addressViem } from "@axiom/config/types/schemas";

export const accessProofSchema = z.object({
  dataHash: hexViem,
  targetPubkey: hexViem,
  nonce: z.union([z.string().max(128), z.number()]),
  proof: hexViem,
  validUntil: z.union([z.string().max(128), z.number()]),
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

export const vaultDepositEncodeSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d+)?$/),
});

export const vaultWithdrawEncodeSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d+)?$/),
});

export const eventBodySchema = z.object({
  source: z.string().min(1).max(128),
  eventName: z.string().min(1).max(128),
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
  proof: z.array(hexViem).max(16),
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

// SSRF guard: http(s) only, and never private/loopback hosts.
const BLOCKED_HOSTS = new Set(["localhost", "0.0.0.0", "::1"]);
const PRIVATE_IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
function isPublicHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return false;
  if (host.endsWith(".localhost") || host.endsWith(".internal")) return false;
  const ip = PRIVATE_IPV4.exec(host);
  if (ip) {
    const a = Number(ip[1]);
    const b = Number(ip[2]);
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
  }
  if (host.includes(":")) {
    if (host === "::1") return false;
    if (host.startsWith("fe80") || host.startsWith("fc") || host.startsWith("fd")) {
      return false;
    }
  }
  return true;
}
const archiveUrlSchema = z.string().url().refine(isPublicHttpUrl, {
  message: "URL must use http(s) and must not target private or loopback hosts",
});

export const archiveLookupSchema = z.object({
  url: archiveUrlSchema,
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const archiveAccountSchema = z.object({
  handle: z.string().min(1).max(64),
  limit: z.number().int().min(1).max(500).optional(),
});

export const archiveConfirmSchema = z.object({
  url: archiveUrlSchema,
});

export const archiveClosestSchema = z.object({
  url: archiveUrlSchema,
  timestamp: z.string().optional(),
});

const chatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.union([z.string().max(32_000), z.null()]).optional(),
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
  messages: z.array(chatMessageSchema).nonempty().max(50),
  tools: z.array(z.any()).optional(),
  model: z.string().optional(),
  stream: z.boolean().optional(),
});
