// Zod source of truth for skill request bodies (REST validation). chat-tools.ts carries
// parallel JSON Schema for LLM tool-calling; args must satisfy both — keep in sync.
import { z } from "zod";

export const evmAddressSchema = z.object({ address: z.string() }); // a single shape serves the evm_wallet, evm_multichain, and evm_contract routes

export const evmTokenOwnerSchema = z.object({
	address: z.string(),
	token: z.string(),
}); // owner plus ERC-20 token shape, shared by evm_wallet route and evm_allowance

export const evmTxSchema = z.object({ hash: z.string() });

export const evmTokenSchema = z.object({
	address: z.string(),
	coingeckoId: z.string().optional(),
});

export const evmGasSchema = z.object({ gasLimit: z.number().optional() });

const WHALE_DEFAULT_FROM_BLOCK = 19_900_000; // fallback scan window so evm_whale runs without all numeric params; caller values win
const WHALE_DEFAULT_TO_BLOCK = 20_000_000;

export const evmWhaleSchema = z.object({
	token: z.string(),
	minValue: z.string().default("0"),
	fromBlock: z.number().default(WHALE_DEFAULT_FROM_BLOCK),
	toBlock: z.number().default(WHALE_DEFAULT_TO_BLOCK),
});

export const evmAllowanceSchema = z.object({
	address: z.string(),
	token: z.string(),
});

export const stocksQuoteSchema = z.object({
	symbol: z.string().min(1).max(12),
});

export const stocksSearchSchema = z.object({
	query: z.string().min(1).max(64),
});

export const stocksHistorySchema = z.object({
	symbol: z.string().min(1).max(12),
	range: z
		.enum(["1d", "5d", "1mo", "3mo", "6mo", "1y", "5y", "max"])
		.default("1y"),
	interval: z.enum(["1m", "5m", "15m", "1d", "1wk", "1mo"]).default("1d"),
});

export const stocksCompareSchema = z.object({
	symbols: z.array(z.string().min(1).max(12)).min(1).max(10),
});

export const stocksCryptoSchema = z.object({
	symbol: z.string().min(1).max(12).default("BTC-USD"),
});

export const osintSecEdgarSchema = z.object({ cik: z.string().min(1).max(12) });

export const osintUsaspendingSchema = z.object({
	filters: z.record(z.string(), z.unknown()),
	limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const osintOfacSdnSchema = z.object({
	name: z.string().min(1).max(200),
});

export const osintOpencorporatesSchema = z.object({
	jurisdiction: z.string().min(2).max(5).default("us"),
	query: z.string().min(1).max(200),
});

export const osintEntityResolveSchema = z.object({
	entities: z.array(z.string().min(1)).min(2).max(20),
});

export const osintCourtlistenerSchema = z.object({
	query: z.string().min(1).max(200),
	type: z.enum(["o", "r"]).optional(),
	limit: z.coerce.number().int().min(1).max(20).optional(),
});

export const unbrokerSchema = z.object({
	// base ERC-7857 agent-transfer params: numeric token id plus recipient address
	tokenId: z.string().regex(/^\d+$/),
	to: z.string(),
});

export const unbrokerAnalyzeSchema = unbrokerSchema.extend({
	accessProof: z
		.object({ dataHash: z.string(), validUntil: z.number() })
		.optional(),
});

export const ossInvestigateSchema = z.object({
	owner: z.string().min(1),
	repo: z.string().min(1),
	bytecode: z.string().optional(),
});

export const ossCommitsSchema = z.object({
	owner: z.string().min(1),
	repo: z.string().min(1),
	sha: z.string().optional(),
	perPage: z.coerce.number().int().min(1).max(100).optional(),
});

export const ossIocSchema = z.object({
	owner: z.string().min(1),
	repo: z.string().min(1),
	path: z.string().optional(),
});

export const ossAuditSchema = z.object({
	owner: z.string().min(1),
	repo: z.string().min(1),
});
