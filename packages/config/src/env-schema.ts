import { z } from "zod";

export const sharedEnvSchema = z.object({
  AXIOM_FRONTEND_URL: z.string().url().optional(),
  AXIOM_API_KEY: z.string().optional(),
  AXIOM_COMPUTE_API_KEY: z.preprocess((val) => {
    if (val === undefined || val === "") {
      return process.env.OG_COMPUTE_API_KEY ?? undefined;
    }
    return val;
  }, z.string().optional()),
  AXIOM_CHAIN_ID: z.coerce.number().int().positive().default(16602),
  OG_COMPUTE_BASE_URL: z.string().url().optional(),
  AXIOM_EVM_RPC: z.string().url().optional(),
  // Comma-separated fallback RPC URLs appended after the primary in the
  // backend FallbackProvider (rd2 §1 R4; quorum 1 = first-healthy semantics).
  AXIOM_EVM_RPC_FALLBACKS: z.string().optional(),
  AXIOM_ORACLE_URL: z.string().url().optional(),
  AXIOM_TEE_SIGNER_PK: z.string().optional(),
  AXIOM_SENTRY_DSN: z.string().optional(),
  AXIOM_COMPUTE_BASE_URL: z.string().url().optional(),
  AXIOM_DISABLE_AUTH: z.string().optional(),
  AXIOM_COMPUTE_DIRECT_KEY: z.string().optional(),
  // Direct-path shim (W-2): direct compute mode (AXIOM_COMPUTE_DIRECT_KEY) falls
  // back to this hardcoded proxy when AXIOM_COMPUTE_DIRECT_URL is unset. Declared
  // here so the constant lives with its sibling env knobs, not at the call site.
  AXIOM_COMPUTE_DIRECT_PROXY_URL: z
    .string()
    .url()
    .default("https://compute-network-6.integratenetwork.work/v1/proxy"),
  AXIOM_COMPUTE_DIRECT_URL: z.string().url().optional(),
  // Router per-request price caps (X-0G-Provider-Max-Price-Usd-Prompt/-Completion, USD/1M tokens)
  // and TEE tier floor (X-0G-Provider-Trust-Mode) — see providers.ts createRouterClient.
  AXIOM_COMPUTE_MAX_PRICE_USD: z.string().optional(),
  AXIOM_COMPUTE_TRUST_MODE: z
    .enum(["standard", "verified", "private"])
    .default("verified"),
  // Old silent behavior for checkpoint-loss resync (indexer) — default is loud.
  AXIOM_QUIET_RESYNC: z.string().optional(),
  AXIOM_CLIENT_API_KEY: z.string().optional(),
  AXIOM_EVENT_SOURCES: z.string().optional(),
  AXIOM_HEALTH_CACHE_MS: z.coerce.number().int().positive().optional(),
  AXIOM_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  AXIOM_CHAT_STREAM_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  AXIOM_DATA_DIR: z.string().optional(),
  AXIOM_ALLOW_MULTI_INSTANCE: z.string().optional(),
  AXIOM_ALLOW_CLEARTEXT_DEK: z.string().optional(),
});
