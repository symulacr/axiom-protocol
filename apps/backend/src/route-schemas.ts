import { z } from "zod";
import { hexViem, addressViem } from "@axiom/config/types/hex";

const accessProofSchema = z.object({
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
  sealedDataEncryptionKey: z.string().optional(),
  oldDataUri: hexViem.optional(),
  accessProof: accessProofSchema.optional(),
});

export const royaltySchema = z.object({
  bps: z.number().int().min(0).max(10000),
});

/** Body for POST /oracle/v1/agents/mint (in-process oracle registration). */
export const mintDataHashSchema = z.object({
  dataHash: hexViem,
});

const amountStringSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d+)?$/),
});

export const vaultDepositEncodeSchema = amountStringSchema;
export const vaultWithdrawEncodeSchema = amountStringSchema;

export const eventBodySchema = z.object({
  source: z.string().min(1).max(128),
  eventName: z.string().min(1).max(128),
  chainId: z.number().int().positive(),
  blockNumber: z.number().int().nonnegative(),
  txHash: z
    .string()
    .regex(/^0x[a-fA-F0-9]+$/)
    .optional(),
  logIndex: z.number().int().nonnegative(),
  payload: z.record(z.string(), z.unknown()),
});

export const tickSchema = z.object({
  vault: addressViem,
  agentNft: addressViem,
  agentTokenId: z.string().regex(/^\d+$/),
  computeModel: z.string().optional(),
  strategy: z.string().optional(),
  systemPrompt: z.string().optional(),
  signalSource: z.string().optional(),
  signalPayload: z.unknown().optional(),
  stream: z.boolean().optional(),
  executionPlan: z
    .object({
      target: addressViem,
      value: z.union([z.string(), z.number()]).optional(),
      data: hexViem.optional(),
      merkleProof: z.array(hexViem).min(1).max(32),
    })
    .optional(),
});

// SSRF guard: http(s) only, and never private or loopback hosts.
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
    if (
      host.startsWith("fe80") ||
      host.startsWith("fc") ||
      host.startsWith("fd")
    ) {
      return false;
    }
  }
  return true;
}
// Bare hosts normalize to https:// before the Wayback lookup; the SSRF guard still applies to fully-formed URLs.
export const archiveUrlSchema = z
  .string()
  .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
  .pipe(
    z.string().url().refine(isPublicHttpUrl, {
      message:
        "URL must use http(s) and must not target private or loopback hosts",
    }),
  );

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

// Optional 0G compute router routing preference. Mapped to X-0G-Provider-* request headers by the
// backend (the `provider` body field itself is never forwarded — the router treats it as
// deprecated). Price caps are USD per 1M tokens.
export const providerRoutingSchema = z
  .object({
    sort: z.enum(["latency", "price"]).optional(),
    address: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/)
      .optional(),
    allowFallbacks: z.boolean().optional(),
    trustMode: z.enum(["standard", "verified", "private"]).optional(),
    maxPriceUsdPrompt: z.number().nonnegative().optional(),
    maxPriceUsdCompletion: z.number().nonnegative().optional(),
  })
  .optional();

export const chatBodySchema = z.object({
  messages: z.array(chatMessageSchema).nonempty().max(50),
  tools: z.array(z.any()).optional(),
  model: z.string().optional(),
  stream: z.boolean().optional(),
  // Optional wallet address that keys the transcript thread (stable per wallet); absent = anonymous thread.
  wallet: addressViem.optional(),
  provider: providerRoutingSchema,
});

/** Query schema for GET /v1/chat/history — wallet is required so transcripts are scoped to one owner. */
export const chatHistoryQuerySchema = z.object({
  wallet: addressViem,
});
