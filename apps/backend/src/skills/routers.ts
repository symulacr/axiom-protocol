import type { Router, Request, Response } from "express";
import { ethers } from "ethers";
import type { z } from "zod";
import type { ServerConfig } from "../config-types.js";
import {
  createSkillRouter,
  type SkillRouter,
  cachedJsonGet,
  serialize,
  getLogsChunked,
} from "../skills/shared.js";
import { getSharedProvider } from "../provider.js";
import { TTLCache, sendError } from "../utils/response.js";
import { createLogger } from "../utils/logger.js";
import { TRANSFER_TOPIC } from "@axiom/config";
import { AGENT_NFT_ABI, ERC20_ABI } from "@axiom/config/abis";
import { HTTP } from "@axiom/config";
import {
  evmAddressSchema,
  evmTokenOwnerSchema,
  evmTxSchema,
  evmTokenSchema,
  evmGasSchema,
  evmWhaleSchema,
  evmAllowanceSchema,
  stocksQuoteSchema,
  stocksSearchSchema,
  stocksHistorySchema,
  stocksCompareSchema,
  stocksCryptoSchema,
  osintSecEdgarSchema,
  osintUsaspendingSchema,
  osintOfacSdnSchema,
  osintCompanySearchSchema,
  osintEntityResolveSchema,
  osintCourtlistenerSchema,
  unbrokerSchema,
  unbrokerAnalyzeSchema,
} from "@axiom/config/skills/schemas";

const logEvm = createLogger("skills:evm");

function mustMethod<T extends (...args: never[]) => unknown>(
  // Constant ABIs make a missing method a programming error: fail loudly, don't mask it with optional chaining.

  fn: T | undefined,
  what: string,
): T {
  if (!fn) throw new Error(`Contract method unavailable: ${what}`);
  return fn;
}

const DEX_SPENDERS: Record<string, string> = {
  uniswapV3: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  sushiswap: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
  oneInch: "0x1111111254fb6c44bAC0beD2854e76F90643097d",
};

const CHAINS: { name: string; rpc: string }[] = [
  { name: "ethereum", rpc: "https://ethereum-rpc.publicnode.com" },
  { name: "polygon", rpc: "https://polygon-bor-rpc.publicnode.com" },
  { name: "arbitrum", rpc: "https://arb1.arbitrum.io/rpc" },
  { name: "optimism", rpc: "https://mainnet.optimism.io" },
  { name: "base", rpc: "https://mainnet.base.org" },
  { name: "bsc", rpc: "https://bsc-dataseed.binance.org" },
  { name: "avalanche", rpc: "https://api.avax.network/ext/bc/C/rpc" },
  { name: "gnosis", rpc: "https://rpc.gnosischain.com" },
];

const COINGECKO_API = "https://api.coingecko.com";
const priceGet = cachedJsonGet(COINGECKO_API, { ttlMs: 60_000 });

async function fetchPrice(id: string): Promise<number> {
  const j = (await priceGet(
    id,
    `/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
  )) as Record<string, { usd?: number }>;
  return j[id]?.usd ?? 0;
}

type SkillHandlerFn<S extends z.ZodTypeAny> = (
  parsed: z.infer<S>,
  req: Request,
  res: Response,
  helpers: { id: string; config: ServerConfig },
) => Promise<unknown>;

interface SkillRouteDef<S extends z.ZodTypeAny = z.ZodTypeAny> {
  path: string;
  schema: S;
  description: string;
  handler: SkillHandlerFn<S>;
  /** When true only server API key may call (destructive skills). */
  requiresServerAuth?: boolean;
}

function skill<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  description: string,
  handler: SkillHandlerFn<S>,
  requiresServerAuth = false,
): SkillRouteDef<S> {
  return {
    path,
    schema,
    description,
    handler,
    requiresServerAuth,
  };
}

function registerSkillRoutes(
  route: SkillRouter["route"],
  registrations: SkillRouteDef[],
): void {
  // One registration indirection keeps path/schema/handler/auth together, replacing five near-identical factories; positional flags stay (an options object would churn 28 call sites).
  for (const r of registrations) {
    const handler: SkillHandlerFn<z.ZodTypeAny> = (
      parsed,
      req,
      res,
      helpers,
    ) => {
      if (r.requiresServerAuth) {
        const principal = (req as { authPrincipal?: string }).authPrincipal;
        if (principal === "client")
          return Promise.resolve({
            ok: false,
            error: "forbidden: server API key required for this skill",
            code: "SERVER_KEY_REQUIRED",
          });
      }
      return r.handler(parsed, req, res, helpers);
    };
    route(
      { path: r.path, schema: r.schema, description: r.description },
      handler,
    );
  }
}

const YAHOO_BASE = "https://query2.finance.yahoo.com";
const yahooGet = cachedJsonGet(YAHOO_BASE, { ttlMs: 30_000 });
let crumb = "";
let cookie = "";

async function ensureCrumb(): Promise<void> {
  if (crumb && cookie) return;
  const resp = await fetch(`${YAHOO_BASE}/v1/test/getcrumb`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  const setCookie = resp.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0] ?? "";
  crumb = await resp.text();
}

interface YahooChartMeta {
  symbol?: string;
  regularMarketPrice?: unknown;
  chartPreviousClose?: unknown;
  previousClose?: unknown;
  currency?: string;
  exchangeName?: string;
  marketState?: string;
}

interface YahooQuotePoint {
  open?: Array<number | null>;
  high?: Array<number | null>;
  low?: Array<number | null>;
  close?: Array<number | null>;
  volume?: Array<number | null>;
}

interface YahooChartResult {
  meta: YahooChartMeta;
  timestamp?: number[];
  indicators: { quote: YahooQuotePoint[] };
}

interface YahooChartResponse {
  chart: { result?: YahooChartResult[] };
}

interface YahooSearchQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchange?: string;
}

interface YahooSearchResponse {
  quotes?: YahooSearchQuote[];
}

async function yahooFetch<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  await ensureCrumb();
  const qs = new URLSearchParams({ ...params, crumb }).toString();
  const full = `${path}?${qs}`;
  return (await yahooGet(full, full, {
    headers: { Cookie: cookie },
    signal: AbortSignal.timeout(15_000),
  })) as T;
}

function extractQuote(result: YahooChartResponse) {
  const meta: YahooChartMeta = result.chart?.result?.[0]?.meta ?? {};
  return serialize({
    symbol: meta.symbol,
    price: meta.regularMarketPrice,
    previousClose: meta.chartPreviousClose ?? meta.previousClose,
    currency: meta.currency,
    exchange: meta.exchangeName,
    marketState: meta.marketState,
  });
}

async function chartQuote(symbol: string, range: string, interval: string) {
  const data = await yahooFetch<YahooChartResponse>(
    `/v8/finance/chart/${symbol}`,
    { range, interval },
  );
  return extractQuote(data);
}

const cachedGet = cachedJsonGet("", {
  headers: { "User-Agent": "AxiomAgent/1.0", Accept: "application/json" },
  ttlMs: 5 * 60 * 1000,
});

async function cachedFetch(
  key: string,
  url: string,
  init?: RequestInit,
): Promise<unknown> {
  return cachedGet(key, url, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(15_000),
  });
}

function tokenScore(a: string, b: string): number {
  const tokA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const tokB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokA) if (tokB.has(t)) overlap++;
  return overlap / Math.max(tokA.size, tokB.size);
}

const ofacHeaders = {
  // OFAC rejects non-browser UAs (406) and returns HTML; browser headers keep this a 200, not a 502
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
  Accept: "text/html,application/xhtml+xml",
};
const ofacCache = new TTLCache<string>(5 * 60 * 1000);
const OFAC_BASE_URL = "https://sanctionssearch.ofac.treas.gov";
async function ofacFetch(path: string): Promise<string> {
  const cached = ofacCache.get(path);
  if (cached !== undefined) return cached;
  const res = await fetch(`${OFAC_BASE_URL}${path}`, {
    headers: ofacHeaders,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  ofacCache.set(path, text);
  return text;
}

const logUnbroker = createLogger("skills:unbroker");

export function createSkillRouters(config: ServerConfig): Router {
  const { router, route } = createSkillRouter(config);
  const provider = getSharedProvider();
  const getNft = (addr: string) =>
    new ethers.Contract(addr, AGENT_NFT_ABI, provider);
  const requireNft = (res: Response): ethers.Contract | null => {
    const nftAddr = config.addresses?.agentNft;
    if (!nftAddr) {
      sendError(
        res,
        HTTP.SERVICE_UNAVAILABLE,
        "AgentNFT address not configured",
      );
      return null;
    }
    return getNft(nftAddr);
  };

  registerSkillRoutes(route, [
    skill(
      "/v1/skills/evm/wallet",
      evmTokenOwnerSchema,
      "Query EVM wallet native and ERC-20 balances",
      async (parsed) => {
        const [native, tokenContract] = await Promise.all([
          provider.getBalance(parsed.address),
          parsed.token
            ? new ethers.Contract(parsed.token, ERC20_ABI, provider)
            : null,
        ]);
        const erc20Balance = tokenContract
          ? await mustMethod(
              tokenContract.balanceOf,
              "balanceOf",
            )(parsed.address).catch((err) => {
              logEvm.warn("evm wallet balanceOf failed", { err });
              return 0n;
            })
          : 0n;
        return serialize({ native, erc20Balance });
      },
    ),
    skill(
      "/v1/skills/evm/multichain",
      evmAddressSchema,
      "Query wallet balances across multiple EVM chains",
      async (parsed) => {
        const results = await Promise.allSettled(
          CHAINS.map(async ({ name, rpc }) => {
            const p = new ethers.JsonRpcProvider(rpc);
            const bal = await p.getBalance(parsed.address);
            return { chain: name, balance: bal.toString() };
          }),
        );
        return serialize(
          results.map((r, i) =>
            r.status === "fulfilled"
              ? r.value
              : { chain: CHAINS[i]?.name, error: String(r.reason) },
          ),
        );
      },
    ),
    skill(
      "/v1/skills/evm/tx",
      evmTxSchema,
      "Fetch an EVM transaction and its receipt",
      async (parsed) => {
        const [tx, receipt] = await Promise.all([
          provider.getTransaction(parsed.hash),
          provider.getTransactionReceipt(parsed.hash),
        ]);
        return serialize({ tx, receipt });
      },
    ),
    skill(
      "/v1/skills/evm/token",
      evmTokenSchema,
      "ERC-20 token metadata and price",
      async (parsed) => {
        const c = new ethers.Contract(parsed.address, ERC20_ABI, provider);
        const [name, symbol, decimals] = await Promise.all([
          mustMethod(c.name, "name")(),
          mustMethod(c.symbol, "symbol")(),
          mustMethod(c.decimals, "decimals")(),
        ]);
        const price = parsed.coingeckoId
          ? await fetchPrice(parsed.coingeckoId)
          : null;
        return serialize({ name, symbol, decimals, price });
      },
    ),
    skill(
      "/v1/skills/evm/gas",
      evmGasSchema,
      "Estimate EVM gas cost for a transaction",
      async (parsed) => {
        const feeData = await provider.getFeeData();
        const gasLimit = BigInt(parsed.gasLimit ?? 21_000);
        const gasPrice = feeData.gasPrice ?? 0n;
        const estCostWei = gasPrice * gasLimit;
        const ethPrice = await fetchPrice("ethereum");
        const estCostUsd = Number(ethers.formatEther(estCostWei)) * ethPrice;
        return serialize({
          gasPrice: gasPrice.toString(),
          maxFeePerGas: feeData.maxFeePerGas?.toString(),
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
          estCostWei: estCostWei.toString(),
          estCostUsd,
        });
      },
    ),
    skill(
      "/v1/skills/evm/whale",
      evmWhaleSchema,
      "Scan for large (whale) ERC-20 transfers",
      async (parsed) => {
        const minValue = BigInt(parsed.minValue);
        const transfers: unknown[] = [];
        for await (const logs of getLogsChunked({
          address: parsed.token,
          topics: [TRANSFER_TOPIC],
          fromBlock: parsed.fromBlock,
          toBlock: parsed.toBlock,
        })) {
          for (const log of logs) {
            const value = BigInt(log.data);
            if (value >= minValue) {
              transfers.push({
                from: ethers.getAddress(
                  "0x" + (log.topics[1]?.slice(26) ?? ""),
                ),
                to: ethers.getAddress("0x" + (log.topics[2]?.slice(26) ?? "")),
                value: value.toString(),
                txHash: log.transactionHash,
                block: parseInt(log.blockNumber, 16),
              });
            }
          }
        }
        return serialize({ transfers, count: transfers.length });
      },
    ),
    skill(
      "/v1/skills/evm/contract",
      evmAddressSchema,
      "Inspect contract code and proxy implementation",
      async (parsed) => {
        const code = await provider.getCode(parsed.address);
        const isContract = code !== "0x";
        let impl: string | null = null;
        if (isContract) {
          const slot = await provider.getStorage(
            parsed.address,
            "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
          );
          const slotBytes = ethers.zeroPadValue(slot, 32);
          if (slotBytes !== ethers.ZeroHash) {
            impl = ethers.getAddress("0x" + slotBytes.slice(26));
          }
        }
        return serialize({
          isContract,
          codeLength: (code.length - 2) / 2,
          proxyImpl: impl,
        });
      },
    ),
    skill(
      "/v1/skills/evm/allowance",
      evmAllowanceSchema,
      "Check ERC-20 allowances for known DEX spenders",
      async (parsed) => {
        const c = new ethers.Contract(parsed.token, ERC20_ABI, provider);
        const entries = await Promise.all(
          Object.entries(DEX_SPENDERS).map(async ([dex, spender]) => {
            const allowance: bigint = await mustMethod(
              c.allowance,
              "allowance",
            )(parsed.address, spender);
            return { dex, spender, allowance: allowance.toString() };
          }),
        );
        return serialize({ allowances: entries });
      },
    ),

    skill(
      "/v1/skills/stocks/quote",
      stocksQuoteSchema,
      "Real-time stock quote",
      async (parsed) => chartQuote(parsed.symbol, "1d", "1d"),
    ),
    skill(
      "/v1/skills/stocks/search",
      stocksSearchSchema,
      "Yahoo Finance symbol search",
      async (parsed) => {
        const data = await yahooFetch<YahooSearchResponse>(
          `/v1/finance/search`,
          { q: parsed.query, quotesCount: "8", newsCount: "0" },
        );
        return serialize({
          results: (data.quotes ?? []).map((q) => ({
            symbol: q.symbol,
            name: q.shortname ?? q.longname,
            type: q.quoteType,
            exchange: q.exchange,
          })),
        });
      },
    ),
    skill(
      "/v1/skills/stocks/history",
      stocksHistorySchema,
      "Historical price data",
      async (parsed) => {
        const data = await yahooFetch<YahooChartResponse>(
          `/v8/finance/chart/${parsed.symbol}`,
          { range: parsed.range, interval: parsed.interval },
        );
        const result = data.chart?.result?.[0];
        const timestamps = result?.timestamp ?? [];
        const quote = result?.indicators?.quote?.[0] ?? {};
        const points = timestamps.map((t: number, i: number) => ({
          date: new Date(t * 1000).toISOString().slice(0, 10),
          open: quote.open?.[i],
          high: quote.high?.[i],
          low: quote.low?.[i],
          close: quote.close?.[i],
          volume: quote.volume?.[i],
        }));
        return serialize({
          symbol: parsed.symbol,
          range: parsed.range,
          interval: parsed.interval,
          count: points.length,
          data: points,
        });
      },
    ),
    skill(
      "/v1/skills/stocks/compare",
      stocksCompareSchema,
      "Compare multiple stock quotes",
      async (parsed) => {
        const results = await Promise.allSettled(
          parsed.symbols.map(async (s) => chartQuote(s, "1d", "1d")),
        );
        return serialize({
          quotes: results.map((r, i) =>
            r.status === "fulfilled"
              ? r.value
              : {
                  symbol: parsed.symbols[i],
                  error: r.reason?.message ?? "failed",
                },
          ),
        });
      },
    ),
    skill(
      "/v1/skills/stocks/crypto",
      stocksCryptoSchema,
      "Crypto pair quote (e.g. BTC-USD)",
      async (parsed) => chartQuote(parsed.symbol, "1d", "5m"),
    ),

    skill(
      "/v1/skills/osint/sec_edgar",
      osintSecEdgarSchema,
      "SEC EDGAR company submissions lookup",
      (parsed) => {
        const cik = parsed.cik.padStart(10, "0");
        return cachedFetch(
          `edgar:${cik}`,
          `https://data.sec.gov/submissions/CIK${cik}.json`,
        );
      },
    ),
    skill(
      "/v1/skills/osint/usaspending",
      osintUsaspendingSchema,
      "USASpending.gov federal award search",
      (parsed) => {
        return cachedFetch(
          `spend:${JSON.stringify(parsed.filters)}`,
          "https://api.usaspending.gov/api/v2/search/spending_by_award/",
          {
            method: "POST",
            // bun fetch does NOT auto-set content-type for string bodies; USASpending
            // rejects POSTs without application/json with a 415.
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              filters: parsed.filters,
              fields: [
                "Award ID",
                "Recipient Name",
                "Award Amount",
                "Award Type",
              ],
              limit: parsed.limit ?? 10,
              sort: "Award Amount",
              order: "desc",
            }),
          },
        );
      },
    ),
    skill(
      "/v1/skills/osint/ofac_sdn",
      osintOfacSdnSchema,
      "OFAC SDN list name search",
      async (parsed) => {
        const q = encodeURIComponent(parsed.name);
        const html = await ofacFetch(
          `/Details.aspx?id=0&name=${q}&program=SDN`,
        );
        return serialize({
          name: parsed.name,
          source: "ofac-sanctions-search",
          html,
        });
      },
    ),
    skill(
      "/v1/skills/osint/company_search",
      osintCompanySearchSchema,
      "GLEIF legal-entity search (keyless)",
      (parsed) => {
        const q = encodeURIComponent(parsed.query);
        // GLEIF public API — no key, no signup (replaced OpenCorporates, whose self-serve tier went sales-only).
        return cachedFetch(
          `gleif:${parsed.query}:${parsed.limit}`,
          `https://api.gleif.org/api/v1/lei-records?filter[entity.legalName]=${q}&page[size]=${parsed.limit}`,
        );
      },
    ),
    skill(
      "/v1/skills/osint/entity_resolve",
      osintEntityResolveSchema,
      "Resolve whether entity names refer to the same company",
      (parsed) => {
        const { entities } = parsed;
        const scores: Array<{ pair: [string, string]; score: number }> = [];
        for (let i = 0; i < entities.length; i++) {
          const a = entities[i];
          if (a === undefined) continue;
          for (let j = i + 1; j < entities.length; j++) {
            const b = entities[j];
            if (b === undefined) continue;
            scores.push({
              pair: [a, b],
              score: tokenScore(a, b),
            });
          }
        }
        scores.sort((a, b) => b.score - a.score);
        return Promise.resolve(serialize({ matches: scores }));
      },
    ),
    skill(
      "/v1/skills/osint/courtlistener",
      osintCourtlistenerSchema,
      "CourtListener opinions and RECAP search",
      (parsed) => {
        const q = encodeURIComponent(parsed.query);
        const type = parsed.type ?? "o";
        const endpoint = type === "o" ? "search" : "recap";
        // Optional CourtListener token (P4): sent as an Authorization header; anonymous calls unchanged. Read per request.
        const token = process.env.COURTLISTENER_API_TOKEN?.trim();
        return cachedFetch(
          `court:${type}:${parsed.query}:${token ? "auth" : "anon"}`,
          `https://www.courtlistener.com/api/rest/v3/${endpoint}/?q=${q}&page_size=${parsed.limit ?? 10}`,
          token ? { headers: { Authorization: `Token ${token}` } } : undefined,
        );
      },
    ),

    skill(
      "/v1/skills/unbroker/simulate",
      unbrokerSchema,
      "Simulate an ERC-7857 transfer without sending",
      async (parsed, _req, res) => {
        const { tokenId, to } = parsed;
        const nft = requireNft(res);
        if (!nft) return;
        const [owner, data] = await Promise.all([
          mustMethod(nft.ownerOf, "ownerOf")(BigInt(tokenId)),
          mustMethod(
            nft.intelligentDatasOf,
            "intelligentDatasOf",
          )(BigInt(tokenId)),
        ]);
        return serialize({
          tokenId,
          to,
          owner,
          dataHash: data[0]?.dataHash ?? null,
          canTransfer: owner !== ethers.ZeroAddress,
        });
      },
    ),
    skill(
      "/v1/skills/unbroker/route",
      unbrokerSchema,
      "Compare transfer path options",
      async (parsed) => {
        return serialize({
          tokenId: parsed.tokenId,
          to: parsed.to,
          directGas: "25000",
          oracleGas: "45000",
          recommended: "direct",
          note: "Use oracle path if encrypted metadata re-keying is required",
        });
      },
    ),
    skill(
      "/v1/skills/unbroker/analyze",
      unbrokerAnalyzeSchema,
      "Validate transfer proof and compute safety score",
      async (parsed, _req, res) => {
        const { tokenId, to, accessProof } = parsed;
        const nft = requireNft(res);
        if (!nft) return;
        let score = 100;
        const issues: string[] = [];
        try {
          const owner = await mustMethod(
            nft.ownerOf,
            "ownerOf",
          )(BigInt(tokenId));
          const data = await mustMethod(
            nft.intelligentDatasOf,
            "intelligentDatasOf",
          )(BigInt(tokenId));
          const dataHash = data[0]?.dataHash;
          if (accessProof) {
            if (accessProof.dataHash !== dataHash) {
              score -= 30;
              issues.push("Data hash mismatch");
            }
            if (accessProof.validUntil < Date.now() / 1000) {
              score -= 25;
              issues.push("Proof expired");
            }
          } else {
            score -= 40;
            issues.push("No access proof provided");
          }
          let rating: "SAFE" | "CAUTION" | "UNSAFE";
          if (score >= 80) rating = "SAFE";
          else if (score >= 50) rating = "CAUTION";
          else rating = "UNSAFE";
          return serialize({
            tokenId,
            to,
            owner,
            dataHash,
            safetyScore: Math.max(0, score),
            rating,
            issues,
          });
        } catch (err) {
          logUnbroker.warn("unbroker analyze failed", {
            err: err instanceof Error ? err.message : String(err),
          });
          return serialize({
            tokenId,
            to,
            safetyScore: 0,
            rating: "UNSAFE",
            issues: ["Failed to validate on-chain state"],
          });
        }
      },
    ),
  ]);

  return router;
}
