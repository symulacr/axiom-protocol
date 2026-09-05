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
  AXIOM_CHAIN_ID: z.coerce.number().int().positive().default(16661),
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
  // Proof-cleanup keeper (ADR-003 wave I3, docs/adr/003-proof-cleanup-keeper-options.md).
  // Mode default OFF — zero behavior change for existing deploys.
  AXIOM_KEEPER_MODE: z
    .enum(["chainlink", "gelato", "indexer", "off"])
    .default("off"),
  AXIOM_KEEPER_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(86_400_000),
  AXIOM_KEEPER_GAS_CAP_GWEI: z.coerce.number().nonnegative().optional(),
  // Operator-supplied candidate nonces (comma-separated 0x-padded 32-byte hex);
  // the on-chain usedProofs mapping is internal, so no enumeration exists.
  AXIOM_KEEPER_NONCES: z.string().optional(),
  // Sweep-batch ceiling; the contract require()s batchMax <= 256 (BaseVerifier.sol:24).
  AXIOM_KEEPER_BATCH_MAX: z.coerce
    .number()
    .int()
    .positive()
    .max(256)
    .default(256),
  // ProofUsed log-scan lookback in blocks (wave 1B). Sweep candidates derive
  // from ProofUsed logs in [latest - lookback, latest]; proofs live
  // maxProofAgeSeconds (default 7d) on chain, so older logs are unsweepable.
  AXIOM_KEEPER_LOG_LOOKBACK_BLOCKS: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  // Sealed-DEK custody (proto-hashless-completion.md option C, ADR-004 §2.4):
  // oracle stores ECIES-sealed DEKs keyed by tokenId and re-keys transfers from
  // custody. Default OFF — prod trust geometry unchanged (BYOK stays the default).
  AXIOM_DEK_CUSTODY: z.enum(["true", "false"]).default("false"),
  // GasTank relayer (V3 W5-B). Mode default OFF — zero behavior change for
  // existing deploys; when ON, AXIOM_GAS_TANK_ADDRESS + AXIOM_RELAYER_PK are
  // mandatory (fail-start enforced by the backend relayer wiring).
  AXIOM_RELAYER_MODE: z.enum(["on", "off"]).default("off"),
  // Queue polling cadence for the relayer worker loop (batch submitter).
  AXIOM_RELAYER_INTERVAL_MS: z.coerce.number().int().positive().optional(),
  // Max queued forward-requests drained per relayer tick.
  AXIOM_RELAYER_BATCH_MAX: z.coerce
    .number()
    .int()
    .positive()
    .max(64)
    .default(64),
  // Gas-price ceiling (gwei) for relayer-submitted relay() txs.
  AXIOM_RELAYER_GAS_CAP_GWEI: z.coerce.number().nonnegative().optional(),
  // Relayed-log scan lookback for reconciliation (blocks behind head).
  AXIOM_RELAYER_LOG_LOOKBACK_BLOCKS: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  // Reconcile pass cadence (queue entries vs on-chain Relayed logs / dead-letter).
  AXIOM_RELAYER_RECONCILE_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60_000),
  // Sponsored-op admission: token-bucket refill rate per user per minute.
  AXIOM_RELAYER_SPONSOR_RATE_PER_MIN: z.coerce
    .number()
    .int()
    .positive()
    .default(6),
  // Sponsored-op admission: user-signed maxGasCost ceiling (wei) accepted per op.
  AXIOM_RELAYER_SPONSOR_MAX_GAS_COST_WEI: z.coerce
    .bigint()
    .positive()
    .default(1_000_000_000_000_000n),
  // Sponsored-op admission: max concurrently inflight (queued or pending) ops per user.
  AXIOM_RELAYER_SPONSOR_MAX_INFLIGHT_PER_USER: z.coerce
    .number()
    .int()
    .positive()
    .default(2),
  // Testnet faucet (V3 W6-B): one-time axmUSDC drip via the relayer, keyed on
  // the first sponsor op seen for an address. ON by default — mock token
  // testnet-only; flip off for Aristotle.
  AXIOM_FAUCET_ENABLED: z.enum(["true", "false"]).default("true"),
  // Faucet drip size in axmUSDC base units (6 decimals). Default 1000e6.
  AXIOM_FAUCET_AMOUNT_USDC: z.coerce
    .bigint()
    .positive()
    .default(1_000_000_000n),
});
