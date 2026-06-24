import { z } from "zod";
import { hexViem, addressViem } from "@axiom/config/types/schemas";

// ── OpenAI-compatible message types ─────────────────────────────────────────

const functionCallSchema = z.object({
  name: z.string(),
  arguments: z.string(),
});

const toolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: functionCallSchema,
});

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "tool", "developer"]),
  content: z.string().nullable().optional(),
  tool_call_id: z.string().optional(),
  tool_calls: z.array(toolCallSchema).optional(),
  reasoning_content: z.string().optional(),
  name: z.string().optional(),
});

// ── Tool / structured output schemas ─────────────────────────────────────────

const functionDefSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  strict: z.boolean().optional(),
});

const toolSchema = z.object({
  type: z.literal("function"),
  function: functionDefSchema,
});

const toolChoiceSchema = z.union([
  z.literal("none"),
  z.literal("auto"),
  z.literal("required"),
  z.object({ type: z.literal("function"), function: z.object({ name: z.string() }) }),
]);

const responseFormatSchema = z.union([
  z.object({ type: z.literal("text") }),
  z.object({ type: z.literal("json_object") }),
  z.object({ type: z.literal("json_schema"), json_schema: z.record(z.string(), z.unknown()) }),
]);

const streamOptionsSchema = z.object({
  include_usage: z.boolean().optional(),
});

// ── Legacy function_call / functions (deprecated but backward-compatible) ────

const legacyFunctionCallSchema = z.union([
  z.literal("none"),
  z.literal("auto"),
  z.object({ name: z.string() }),
]);

const legacyFunctionDefSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});

export const chatCompletionsSchema = z.object({
  // Required
  model: z.string().min(1),
  messages: z.array(chatMessageSchema).min(1),

  // Generation params
  max_tokens: z.number().int().positive().optional(),
  max_completion_tokens: z.number().int().positive().optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  n: z.number().int().positive().optional(),

  // Streaming
  stream: z.boolean().optional(),
  stream_options: streamOptionsSchema.optional(),

  // Tools
  tools: z.array(toolSchema).optional(),
  tool_choice: toolChoiceSchema.optional(),
  parallel_tool_calls: z.boolean().optional(),

  // Structured output
  response_format: responseFormatSchema.optional(),

  // Penalties
  frequency_penalty: z.number().optional(),
  presence_penalty: z.number().optional(),

  // Reasoning
  reasoning_effort: z.enum(["low", "medium", "high"]).optional(),

  // Logprobs
  logprobs: z.boolean().optional(),
  top_logprobs: z.number().int().positive().optional(),

  // Determinism & routing
  seed: z.number().int().positive().optional(),
  user: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  store: z.boolean().optional(),
  service_tier: z.string().optional(),

  // Deprecated legacy fields
  function_call: legacyFunctionCallSchema.optional(),
  functions: z.array(legacyFunctionDefSchema).optional(),
});

export const mintSchema = z.object({
  agentNft: addressViem,
  encryptedStrategyUri: hexViem,
  sealedKey: hexViem,
  owner: addressViem,
});

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

export const depositSchema = z.object({
  valueWei: z.string().min(1),
  depositor: addressViem.optional(),
});

export const strategySchema = z.object({
  merkleRoot: hexViem,
  dailyLimitWei: z.string().min(1),
});

export const paySchema = z.object({
  amount: z.string().min(1),
});

export const computePaySchema = z.object({
  provider: addressViem,
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
  vault: addressViem.optional(),
  agentNft: addressViem.optional(),
  agentTokenId: z.string().optional(),
  computeModel: z.string().optional(),
  strategy: z.string().optional(),
  signalSource: z.string().optional(),
  signalPayload: z.unknown().optional(),
});
