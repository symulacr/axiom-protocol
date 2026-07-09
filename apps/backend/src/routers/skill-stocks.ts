import { Router } from "express";
import { z } from "zod";
import type { ServerConfig } from "../server.js";
import { createRoute } from "./route-factory.js";
import { TTLCache, ser } from "../skills/shared.js";

const quoteCache = new TTLCache<unknown>(30_000);

const YAHOO_BASE = "https://query2.finance.yahoo.com";
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
  const resp = await fetch(`${YAHOO_BASE}${path}?${qs}`, {
    headers: { Cookie: cookie },
  });
  if (!resp.ok) throw new Error(`Yahoo ${resp.status}: ${await resp.text()}`);
  return (await resp.json()) as T;
}

function extractQuote(result: YahooChartResponse) {
  const meta: YahooChartMeta = result.chart?.result?.[0]?.meta ?? {};
  return ser({
    symbol: meta.symbol,
    price: meta.regularMarketPrice,
    previousClose: meta.chartPreviousClose ?? meta.previousClose,
    currency: meta.currency,
    exchange: meta.exchangeName,
    marketState: meta.marketState,
  });
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const symbolSchema = z.object({ symbol: z.string().min(1).max(12) });
const searchSchema = z.object({ query: z.string().min(1).max(64) });
const historySchema = z.object({
  symbol: z.string().min(1).max(12),
  range: z.enum(["1d", "5d", "1mo", "3mo", "6mo", "1y", "5y", "max"]).default("1y"),
  interval: z.enum(["1m", "5m", "15m", "1d", "1wk", "1mo"]).default("1d"),
});
const compareSchema = z.object({ symbols: z.array(z.string().min(1).max(12)).min(1).max(10) });
const cryptoSchema = z.object({ symbol: z.string().min(1).max(12).default("BTC-USD") });

// ── Router ────────────────────────────────────────────────────────────────────

export function createSkillStocksRouter(config: ServerConfig): Router {
  const router = Router();

  createRoute(router, { path: "/v1/skills/stocks/quote", schema: symbolSchema, consumer: "chat-runtime", description: "Real-time stock quote" },
    async (parsed: z.infer<typeof symbolSchema>) => {
      const cached = quoteCache.get(parsed.symbol);
      if (cached) return cached;
      const data = await yahooFetch<YahooChartResponse>(`/v8/finance/chart/${parsed.symbol}`, { range: "1d", interval: "1d" });
      const quote = extractQuote(data);
      quoteCache.set(parsed.symbol, quote);
      return quote;
    }, config);

  createRoute(router, { path: "/v1/skills/stocks/search", schema: searchSchema, consumer: "chat-runtime", description: "Yahoo Finance symbol search" },
    async (parsed: z.infer<typeof searchSchema>) => {
      const data = await yahooFetch<YahooSearchResponse>(`/v1/finance/search`, { q: parsed.query, quotesCount: "8", newsCount: "0" });
      return ser({ results: (data.quotes ?? []).map((q) => ({ symbol: q.symbol, name: q.shortname ?? q.longname, type: q.quoteType, exchange: q.exchange })) });
    }, config);

  createRoute(router, { path: "/v1/skills/stocks/history", schema: historySchema, consumer: "chat-runtime", description: "Historical price data" },
    async (parsed: z.infer<typeof historySchema>) => {
      const data = await yahooFetch<YahooChartResponse>(`/v8/finance/chart/${parsed.symbol}`, { range: parsed.range, interval: parsed.interval });
      const result = data.chart?.result?.[0];
      const timestamps = result?.timestamp ?? [];
      const quote = result?.indicators?.quote?.[0] ?? {};
      const points = timestamps.map((t: number, i: number) => ({
        date: new Date(t * 1000).toISOString().slice(0, 10),
        open: quote.open?.[i], high: quote.high?.[i], low: quote.low?.[i], close: quote.close?.[i], volume: quote.volume?.[i],
      }));
      return ser({ symbol: parsed.symbol, range: parsed.range, interval: parsed.interval, count: points.length, data: points });
    }, config);

  createRoute(router, { path: "/v1/skills/stocks/compare", schema: compareSchema, consumer: "chat-runtime", description: "Compare multiple stock quotes" },
    async (parsed: z.infer<typeof compareSchema>) => {
      const results = await Promise.allSettled(parsed.symbols.map(async (s) => {
        const cached = quoteCache.get(s);
        if (cached) return cached;
        const data = await yahooFetch<YahooChartResponse>(`/v8/finance/chart/${s}`, { range: "1d", interval: "1d" });
        const quote = extractQuote(data);
        quoteCache.set(s, quote);
        return quote;
      }));
      return ser({ quotes: results.map((r, i) => r.status === "fulfilled" ? r.value : { symbol: parsed.symbols[i], error: r.reason?.message ?? "failed" }) });
    }, config);

  createRoute(router, { path: "/v1/skills/stocks/crypto", schema: cryptoSchema, consumer: "chat-runtime", description: "Crypto pair quote (e.g. BTC-USD)" },
    async (parsed: z.infer<typeof cryptoSchema>) => {
      const cached = quoteCache.get(`crypto:${parsed.symbol}`);
      if (cached) return cached;
      const data = await yahooFetch<YahooChartResponse>(`/v8/finance/chart/${parsed.symbol}`, { range: "1d", interval: "5m" });
      const quote = extractQuote(data);
      quoteCache.set(`crypto:${parsed.symbol}`, quote);
      return quote;
    }, config);

  return router;
}
