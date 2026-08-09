/**
 * Shared Zod schemas for skill tool parameters.
 *
 * Single source of truth for the shape of every skill endpoint's request body.
 * `apps/backend/src/skills/routers.ts` imports these directly; the REST
 * `skill(...)` handlers validate against them at runtime.
 *
 * `packages/config/src/chat-tools.ts` carries the parallel JSON Schema
 * descriptors that the LLM tool-calling API consumes (it needs raw JSON
 * Schema, not Zod). Each `skill()` entry there carries a
 * `// Schema: @axiom/config/skills/schemas#<name>` comment pointing back here
 * as the source of truth. The two must stay in sync — the chat executor calls
 * the REST endpoints, so an LLM-produced argument set that satisfies the JSON
 * Schema must also satisfy the Zod schema here.
 *
 * Constraints here are intentionally as strict as (or stricter than) the
 * chat-tools JSON Schema: the LLM generates arguments that pass both.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// EVM skills
// ---------------------------------------------------------------------------

/** `evm_wallet` (route) / `evm_multichain` / `evm_contract` — a single address. */
export const evmAddressSchema = z.object({ address: z.string() });

/** `evm_wallet` route + `evm_allowance`: owner address + ERC-20 token contract. */
export const evmTokenOwnerSchema = z.object({
  address: z.string(),
  token: z.string(),
});

/** `evm_tx` — transaction hash lookup. */
export const evmTxSchema = z.object({ hash: z.string() });

/** `evm_token` — ERC-20/721 metadata + optional CoinGecko price id. */
export const evmTokenSchema = z.object({
  address: z.string(),
  coingeckoId: z.string().optional(),
});

/** `evm_gas` — optional gas limit override (default 21000 in handler). */
export const evmGasSchema = z.object({ gasLimit: z.number().optional() });

/**
 * Default scan window for `evm_whale` so the tool is callable without all
 * numeric params. Caller-supplied values still win; these are only fallbacks.
 */
export const WHALE_DEFAULT_FROM_BLOCK = 19_900_000;
export const WHALE_DEFAULT_TO_BLOCK = 20_000_000;

/** `evm_whale` — large ERC-20 transfer scanner. */
export const evmWhaleSchema = z.object({
  token: z.string(),
  minValue: z.string().default("0"),
  fromBlock: z.number().default(WHALE_DEFAULT_FROM_BLOCK),
  toBlock: z.number().default(WHALE_DEFAULT_TO_BLOCK),
});

/** `evm_allowance` — owner address + ERC-20 token contract. */
export const evmAllowanceSchema = z.object({
  address: z.string(),
  token: z.string(),
});

// ---------------------------------------------------------------------------
// Stocks skills
// ---------------------------------------------------------------------------

/** `stocks_quote` — single ticker. */
export const stocksQuoteSchema = z.object({ symbol: z.string().min(1).max(12) });

/** `stocks_search` — free-text company/ticker query. */
export const stocksSearchSchema = z.object({ query: z.string().min(1).max(64) });

/** `stocks_history` — OHLCV history with range/interval. */
export const stocksHistorySchema = z.object({
  symbol: z.string().min(1).max(12),
  range: z.enum(["1d", "5d", "1mo", "3mo", "6mo", "1y", "5y", "max"]).default("1y"),
  interval: z.enum(["1m", "5m", "15m", "1d", "1wk", "1mo"]).default("1d"),
});

/** `stocks_compare` — 1–10 tickers. */
export const stocksCompareSchema = z.object({
  symbols: z.array(z.string().min(1).max(12)).min(1).max(10),
});

/** `stocks_crypto` — crypto pair (defaults to BTC-USD). */
export const stocksCryptoSchema = z.object({
  symbol: z.string().min(1).max(12).default("BTC-USD"),
});

// ---------------------------------------------------------------------------
// OSINT skills
// ---------------------------------------------------------------------------

/** `osint_sec_edgar` — SEC CIK number. */
export const osintSecEdgarSchema = z.object({ cik: z.string().min(1).max(12) });

/** `osint_usaspending` — federal award search filters + optional page size. */
export const osintUsaspendingSchema = z.object({
  filters: z.record(z.string(), z.unknown()),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** `osint_ofac_sdn` — sanctioned entity name. */
export const osintOfacSdnSchema = z.object({ name: z.string().min(1).max(200) });

/** `osint_opencorporates` — company query + optional jurisdiction code. */
export const osintOpencorporatesSchema = z.object({
  jurisdiction: z.string().min(2).max(5).default("us"),
  query: z.string().min(1).max(200),
});

/** `osint_entity_resolve` — 2–20 entity names to cross-reference. */
export const osintEntityResolveSchema = z.object({
  entities: z.array(z.string().min(1)).min(2).max(20),
});

/** `osint_courtlistener` — court opinion / RECAP search. */
export const osintCourtlistenerSchema = z.object({
  query: z.string().min(1).max(200),
  type: z.enum(["o", "r"]).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

// ---------------------------------------------------------------------------
// Unbroker skills (ERC-7857 agent transfers)
// ---------------------------------------------------------------------------

/** Base unbroker params: numeric token id + recipient. */
export const unbrokerSchema = z.object({
  tokenId: z.string().regex(/^\d+$/),
  to: z.string(),
});

/** `unbroker_simulate` / `unbroker_route` / `unbroker_execute`. */
export const unbrokerSimulateSchema = unbrokerSchema;
export const unbrokerRouteSchema = unbrokerSchema;
export const unbrokerExecuteSchema = unbrokerSchema;

/** `unbroker_analyze` — adds an optional access proof. */
export const unbrokerAnalyzeSchema = unbrokerSchema.extend({
  accessProof: z.object({ dataHash: z.string(), validUntil: z.number() }).optional(),
});

// ---------------------------------------------------------------------------
// OSS forensics skills
// ---------------------------------------------------------------------------

/** `oss_forensics_investigate` — repo + optional bytecode for hash compare. */
export const ossInvestigateSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  bytecode: z.string().optional(),
});

/** `oss_forensics_commits` — commit history with force-push detection. */
export const ossCommitsSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  sha: z.string().optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
});

/** `oss_forensics_ioc` — IOC regex scan with optional path filter. */
export const ossIocSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  path: z.string().optional(),
});

/** `oss_forensics_audit` — dependency manifest audit. */
export const ossAuditSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
});
