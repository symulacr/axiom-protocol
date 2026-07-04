// Thin wrapper around the 0G Compute SDK's ReadOnlyInferenceBroker.
// Results are cached for up to CACHE_TTL_MS so the RPC is called at most once per window.
//
// Provider URL resolution and auto-funding live in `./broker.ts` (shared
// factory) and `./router.ts` (OpenAI client construction). This file
// exposes the discovery + cache invalidation surface only.
import { getReadOnlyBroker } from "./broker.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("compute");

export interface ServiceInfo {
  provider: string;
  model: string;
}

let _cachedProviders: ServiceInfo[] | null = null;
let _cachePromise: Promise<ServiceInfo[]> | null = null;
let _cacheTimestamp = 0;
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
  if (_cachedProviders && Date.now() - _cacheTimestamp < CACHE_TTL_MS)
    return _cachedProviders;
  if (_cachePromise) return _cachePromise;

  _cachePromise = (async (): Promise<ServiceInfo[]> => {
    const broker = await getReadOnlyBroker(rpcUrl, chainId);
    const services = await broker.listService();
    const mapped: ServiceInfo[] = services.map(
      (s: { provider?: string; model?: string }) => ({
        provider: s.provider ?? "",
        model: s.model ?? "unknown",
      }),
    );
    _cachedProviders = mapped;
    _cacheTimestamp = Date.now();
    _cachePromise = null;
    return mapped;
  })();

  try {
    return await _cachePromise;
  } catch (err) {
    _cachePromise = null;
    log.warn("Provider discovery failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Invalidate the cached provider list so the next call re-fetches from chain.
 */
export function invalidateProviderCache(): void {
  _cachedProviders = null;
  _cachePromise = null;
  _cacheTimestamp = 0;
}
