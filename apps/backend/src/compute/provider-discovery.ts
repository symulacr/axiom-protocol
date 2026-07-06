// Thin wrapper around the 0G Compute SDK's ReadOnlyInferenceBroker.
// Results are cached for up to CACHE_TTL_MS so the RPC is called at most once per window.
//
// Provider URL resolution and auto-funding live in `./broker.ts` (shared
// factory) and `./router.ts` (OpenAI client construction). This file
// exposes the discovery + cache invalidation surface only.
import {
  clearBrokerCache,
  getReadOnlyBroker,
  resolveChainId,
} from "./broker.js";
import { createLogger } from "../utils/logger.js";
import { extractErrorMessage } from "../utils/response.js";

const log = createLogger("provider-discovery");

export interface ServiceInfo {
  provider: string;
  model: string;
}

export interface SelectProviderOptions {
  /** Prefer provider registered for this model id. */
  model?: string;
}

/** Pick a provider from the on-chain service list with explicit precedence. */
export function selectProvider(
  services: ServiceInfo[],
  opts?: SelectProviderOptions,
): ServiceInfo | undefined {
  if (services.length === 0) return undefined;
  if (opts?.model) {
    const modelLower = opts.model.toLowerCase();
    const byModel = services.find(
      (s) => s.model.toLowerCase() === modelLower && s.provider,
    );
    if (byModel) return byModel;
  }
  return services.find((s) => s.provider) ?? services[0];
}

interface CacheEntry {
  providers: ServiceInfo[];
  timestamp: number;
}

const _cache = new Map<number, CacheEntry>();
const _cachePromises = new Map<number, Promise<ServiceInfo[]>>();
const CACHE_TTL_MS = 300_000; // 5 minutes

/**
 * Discover compute providers via the SDK's ReadOnlyInferenceBroker.
 * The result is cached for TTL (5 min) to tolerate dynamic provider registration.
 *
 * @param rpcUrl   JSON-RPC endpoint URL.
 * @param chainId  Optional chain ID (defaults to `AXIOM_CHAIN_ID` env or Galileo).
 * @returns        List of `ServiceInfo` records (empty on failure).
 */
export async function discoverProviders(
  rpcUrl: string,
  chainId?: number,
): Promise<ServiceInfo[]> {
  const cid = resolveChainId(chainId);
  const cached = _cache.get(cid);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS)
    return cached.providers;

  const inflight = _cachePromises.get(cid);
  if (inflight) return inflight;

  const promise = (async (): Promise<ServiceInfo[]> => {
    const broker = await getReadOnlyBroker(rpcUrl, cid);
    const services = await broker.listService();
    const mapped: ServiceInfo[] = services.map(
      (s: { provider?: string; model?: string }) => ({
        provider: s.provider ?? "",
        model: s.model ?? "unknown",
      }),
    );
    _cache.set(cid, { providers: mapped, timestamp: Date.now() });
    return mapped;
  })();

  _cachePromises.set(cid, promise);

  try {
    return await promise;
  } catch (err) {
    _cachePromises.delete(cid);
    log.warn("Provider discovery failed", {
      error: extractErrorMessage(err),
    });
    return [];
  } finally {
    if (_cachePromises.get(cid) === promise) {
      _cachePromises.delete(cid);
    }
  }
}

/**
 * Invalidate the cached provider list so the next call re-fetches from chain.
 */
export function invalidateProviderCache(): void {
  _cache.clear();
  _cachePromises.clear();
  clearBrokerCache();
}