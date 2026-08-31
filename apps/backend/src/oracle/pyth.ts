import { createLogger } from "../utils/logger.js";
import { TTLCache } from "../utils/response.js";

const log = createLogger("oracle.pyth");

/**
 * Pyth Hermes REST client (V3 W6-B, v1 off-chain prices).
 *
 * Feed IDs below were verified live against the Hermes metadata endpoint
 * (GET /v2/price_feeds?query=<SYMBOL>/USD, asset_type=crypto) — each id's
 * attributes.symbol matches `<SYMBOL>/USD`. Canonical source of truth:
 * https://docs.pyth.network/price-feeds (aka pyth.network/developers/price-feed-ids).
 * MATIC was migrated to POL by Pyth: POLUSD ffd11c5a…70472.
 */
export const PYTH_FEED_IDS: Readonly<Record<string, string>> = Object.freeze({
  BTC: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  ETH: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  SOL: "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  USDC: "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
  ARB: "0x3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5",
  OP: "0x385f64d993f7b77d8182ed5003d97c60aa3361f3cecfe711544d2d59165e9bdf",
  AVAX: "0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7",
  LINK: "0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221",
  POL: "0xffd11c5a1cfd42f80afb2df4d9f264c15f956d68153335374ec10722edd70472",
  DOGE: "0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c",
  ADA: "0x2a01deaec9e51a579277b34b122399984d0bbf57e2458a7e42fecd2829867a0d",
  XRP: "0xec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8",
  BNB: "0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f",
  WBTC: "0xc9d8b075a5c69303365ae23633d4e085199bf5c520a3b90fed1322a0342ffc33",
  WETH: "0x9d4294bbcd1174d6f2003ec365831e64cc31d9f6f15a2b85399db8d5000960f6",
});

/** Hermes cluster order: primary, fallback (both probed at write time). */
export const HERMES_URLS = [
  "https://hermes.pyth.network",
  "https://hermes-beta.pyth.network",
] as const;

/** Fast-fail so a dead Hermes never stalls the HTTP route past its budget. */
const HERMES_TIMEOUT_MS = 5_000;

export interface PythPrice {
  symbol: string;
  /** Human price (expo applied), string to keep JSON bigint-safe. */
  price: string;
  confidence: string;
  expo: number;
  /** Unix ms of the Pyth publish time. */
  publishedAt: number;
}

interface HermesPriceEntry {
  id: string;
  price?: { price: string; conf: string; expo: number; publish_time: number };
  ema_price?: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

function toPrice(symbol: string, entry: HermesPriceEntry): PythPrice | null {
  const p = entry.price ?? entry.ema_price;
  if (!p) return null;
  const price = BigInt(p.price);
  const conf = BigInt(p.conf);
  const expo = p.expo;
  const scale = 10n ** BigInt(-expo);
  const fmt = (v: bigint): string =>
    expo < 0
      ? `${v / scale}.${(v % scale).toString().padStart(-expo, "0")}`
      : (v * 10n ** BigInt(expo)).toString();
  return {
    symbol,
    price: fmt(price),
    confidence: fmt(conf),
    expo,
    publishedAt: p.publish_time * 1000,
  };
}

/**
 * Fetches latest prices for the top-15 feed map. Tries each Hermes URL in
 * order; throws when all fail (routes map that to 503). Results flow through
 * a shared 30s TTL cache — the swap UI can call getPrice freely without
 * hammering Hermes.
 */
export class PythOracle {
  private cache = new TTLCache<PythPrice[]>(30_000, 1);
  private fetchImpl: FetchLike;
  private urls: readonly string[];

  constructor(opts?: {
    fetchImpl?: FetchLike;
    urls?: readonly string[];
    cacheTtlMs?: number;
  }) {
    this.fetchImpl = opts?.fetchImpl ?? fetch;
    this.urls = opts?.urls ?? HERMES_URLS;
    if (opts?.cacheTtlMs !== undefined) {
      this.cache = new TTLCache<PythPrice[]>(opts.cacheTtlMs, 1);
    }
  }

  /** All configured symbols (cache-aware). Throws on total Hermes failure. */
  async latestAll(): Promise<PythPrice[]> {
    const cached = this.cache.get("all");
    if (cached) return cached;
    const query = Object.values(PYTH_FEED_IDS)
      .map((id) => `ids[]=${id}`)
      .join("&");
    let lastErr: unknown = new Error("no Hermes URL configured");
    for (const base of this.urls) {
      try {
        const res = await this.fetchImpl(
          `${base}/api/latest_price_feeds?${query}`,
          {
            signal: AbortSignal.timeout(HERMES_TIMEOUT_MS),
          },
        );
        if (!res.ok) {
          throw new Error(`Hermes ${res.status} from ${base}`);
        }
        const body = (await res.json()) as HermesPriceEntry[];
        const byId = new Map(body.map((e) => [e.id.toLowerCase(), e]));
        const prices: PythPrice[] = [];
        for (const [symbol, id] of Object.entries(PYTH_FEED_IDS)) {
          const entry = byId.get(id.slice(2).toLowerCase());
          if (!entry) continue;
          const price = toPrice(symbol, entry);
          if (price) prices.push(price);
        }
        if (prices.length === 0) {
          throw new Error("Hermes returned no usable prices");
        }
        this.cache.set("all", prices);
        return prices;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  /** Single-symbol convenience for the swap UI's slippage sanity check. */
  async getPrice(symbol: string): Promise<PythPrice | null> {
    const upper = symbol.toUpperCase();
    if (!(upper in PYTH_FEED_IDS)) return null;
    const all = await this.latestAll();
    return all.find((p) => p.symbol === upper) ?? null;
  }

  /** Slippage helper: minimum acceptable output for a swap of `outSymbol`. */
  async suggestedMinOut(
    outSymbol: string,
    expectedOut: string,
    slippageBps: number,
  ): Promise<string | null> {
    const price = await this.getPrice(outSymbol);
    if (!price) return null;
    const out = Number(expectedOut);
    if (!Number.isFinite(out) || out <= 0) return null;
    return (out * (1 - slippageBps / 10_000)).toFixed(6);
  }
}

let shared: PythOracle | null = null;

/** Process-wide oracle (30s cache); constructed lazily on first use. */
export function getPythOracle(): PythOracle {
  if (!shared) shared = new PythOracle();
  return shared;
}

/** Test seam: swap the process-wide instance. */
export function setPythOracle(instance: PythOracle | null): void {
  shared = instance;
}

/** Route-level wrapper: never throws — callers get a typed empty result. */
export async function pythPricesOrEmpty(): Promise<{
  ok: boolean;
  prices: PythPrice[];
  error?: string;
}> {
  try {
    return { ok: true, prices: await getPythOracle().latestAll() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`pyth price fetch failed: ${msg}`);
    return { ok: false, prices: [], error: msg };
  }
}
