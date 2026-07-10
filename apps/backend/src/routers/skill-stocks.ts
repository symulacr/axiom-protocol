import { Router } from "express";
import { z } from "zod";
import type { ServerConfig } from "../server.js";
import { createSkillRouter, cachedJsonGet, ser } from "../skills/shared.js";

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
  return (await yahooGet(full, full, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(15_000) })) as T;
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


const symbolSchema = z.object({ symbol: z.string().min(1).max(12) });
const searchSchema = z.object({ query: z.string().min(1).max(64) });
const historySchema = z.object({
  symbol: z.string().min(1).max(12),
  range: z.enum(["1d", "5d", "1mo", "3mo", "6mo", "1y", "5y", "max"]).default("1y"),
  interval: z.enum(["1m", "5m", "15m", "1d", "1wk", "1mo"]).default("1d"),
});
const compareSchema = z.object({ symbols: z.array(z.string().min(1).max(12)).min(1).max(10) });
const cryptoSchema = z.object({ symbol: z.string().min(1).max(12).default("BTC-USD") });


export function createSkillStocksRouter(config: ServerConfig): Router {
  const { router, route } = createSkillRouter(config);

  route({ path: "/v1/skills/stocks/quote", schema: symbolSchema, description: "Real-time stock quote" },
    async (parsed: z.infer<typeof symbolSchema>) => {
      const data = await yahooFetch<YahooChartResponse>(`/v8/finance/chart/${parsed.symbol}`, { range: "1d", interval: "1d" });
      return extractQuote(data);
    });

  route({ path: "/v1/skills/stocks/search", schema: searchSchema, description: "Yahoo Finance symbol search" },
    async (parsed: z.infer<typeof searchSchema>) => {
      const data = await yahooFetch<YahooSearchResponse>(`/v1/finance/search`, { q: parsed.query, quotesCount: "8", newsCount: "0" });
      return ser({ results: (data.quotes ?? []).map((q) => ({ symbol: q.symbol, name: q.shortname ?? q.longname, type: q.quoteType, exchange: q.exchange })) });
    });

  route({ path: "/v1/skills/stocks/history", schema: historySchema, description: "Historical price data" },
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
    });

  route({ path: "/v1/skills/stocks/compare", schema: compareSchema, description: "Compare multiple stock quotes" },
    async (parsed: z.infer<typeof compareSchema>) => {
      const results = await Promise.allSettled(parsed.symbols.map(async (s) => {
        const data = await yahooFetch<YahooChartResponse>(`/v8/finance/chart/${s}`, { range: "1d", interval: "1d" });
        return extractQuote(data);
      }));
      return ser({ quotes: results.map((r, i) => r.status === "fulfilled" ? r.value : { symbol: parsed.symbols[i], error: r.reason?.message ?? "failed" }) });
    });

  route({ path: "/v1/skills/stocks/crypto", schema: cryptoSchema, description: "Crypto pair quote (e.g. BTC-USD)" },
    async (parsed: z.infer<typeof cryptoSchema>) => {
      const data = await yahooFetch<YahooChartResponse>(`/v8/finance/chart/${parsed.symbol}`, { range: "1d", interval: "5m" });
      return extractQuote(data);
    });

  return router;
}
