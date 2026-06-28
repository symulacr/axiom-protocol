// Thin wrapper around the 0G Compute SDK's ReadOnlyInferenceBroker.
// Results are cached for up to CACHE_TTL_MS so the RPC is called at most once per window.

import { createReadOnlyInferenceBroker } from "@0gfoundation/0g-compute-ts-sdk";
import { GALILEO_CHAIN_ID } from "@axiom/config/networks";
import { createLogger } from "../utils/logger.js";

const log = createLogger("compute");

export interface ServiceInfo {
  provider: string;
  model: string;
  appClientAddr: string;
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
export async function discoverProviders(rpcUrl: string, chainId: number = GALILEO_CHAIN_ID): Promise<ServiceInfo[]> {
  if (_cachedProviders && Date.now() - _cacheTimestamp < CACHE_TTL_MS) return _cachedProviders;
  if (_cachePromise) return _cachePromise;

  _cachePromise = (async (): Promise<ServiceInfo[]> => {
    const cid = chainId ?? (Number(process.env.AXIOM_CHAIN_ID) || GALILEO_CHAIN_ID);
    const broker = await createReadOnlyInferenceBroker(rpcUrl, cid);
    const services = await broker.listService();

    const mapped: ServiceInfo[] = services.map((s: { provider?: string; appClientAddr?: string; model?: string }) => ({
      provider: s.provider ?? s.appClientAddr ?? "",
      model: s.model ?? "unknown",
      appClientAddr: s.appClientAddr ?? s.provider ?? "",
    }));

    _cachedProviders = mapped;
    _cacheTimestamp = Date.now();
    _cachePromise = null;
    return mapped;
  })();

  try {
    return await _cachePromise;
  } catch (err) {
    _cachePromise = null;
    log.warn("Provider discovery failed", { error: err instanceof Error ? err.message : String(err) });
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

/**
 * Resolve a provider's inference URL from the on-chain registry.
 *
 * @param providerAddr  Provider address (case-insensitive).
 * @param rpcUrl        Optional RPC URL for on-chain lookup.
 * @returns             Inference URL or `null`.
 */
export async function resolveProviderUrl(providerAddr: string, rpcUrl?: string): Promise<string | null> {
  try {
    const eRpc = rpcUrl ?? process.env.AXIOM_EVM_RPC ?? "https://evmrpc-testnet.0g.ai";
    const cid = Number(process.env.AXIOM_CHAIN_ID) || GALILEO_CHAIN_ID;
    const broker = await createReadOnlyInferenceBroker(eRpc, cid);
    const services = await broker.listService();
    const found = services.find((s: { provider?: string; appClientAddr?: string; url?: string }) =>
      (s.provider ?? "").toLowerCase() === providerAddr.toLowerCase() ||
      (s.appClientAddr ?? "").toLowerCase() === providerAddr.toLowerCase()
    );
    return found?.url ?? null;
  } catch {
    return null;
  }
}
