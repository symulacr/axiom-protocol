// ─── On-chain compute provider discovery (SDK-backed) ─────────────────────
//
// Thin wrapper around the 0G Compute SDK's ReadOnlyInferenceBroker.
// Results are cached for process lifetime so the RPC is called at most once.

import { ethers } from "ethers";
import { createReadOnlyInferenceBroker } from "@0gfoundation/0g-compute-ts-sdk";
import { GALILEO_CHAIN_ID } from "@axiom/config/networks";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------
export interface ServiceInfo {
  /** Provider on-chain address (lowercased). */
  provider: string;
  /** Model identifier (e.g. "qwen2.5-omni-7b"). */
  model: string;
  /** Application client address. */
  appClientAddr: string;
}

// ---------------------------------------------------------------------------
// Lazy process-lifetime cache
// ---------------------------------------------------------------------------
let _cachedProviders: ServiceInfo[] | null = null;
let _cachePromise: Promise<ServiceInfo[]> | null = null;

/**
 * Discover compute providers via the SDK's ReadOnlyInferenceBroker.
 * The result is cached for the lifetime of the process.
 *
 * @param rpcUrl   JSON-RPC endpoint URL.
 * @param chainId  Optional chain ID (defaults to `AXIOM_CHAIN_ID` env or Galileo).
 * @returns        List of `ServiceInfo` records (empty on failure).
 */
export async function discoverProviders(rpcUrl: string, chainId: number = GALILEO_CHAIN_ID): Promise<ServiceInfo[]> {
  if (_cachedProviders) return _cachedProviders;
  if (_cachePromise) return _cachePromise;

  _cachePromise = (async (): Promise<ServiceInfo[]> => {
    const cid = chainId ?? (Number(process.env.AXIOM_CHAIN_ID) || GALILEO_CHAIN_ID);
    const broker = await createReadOnlyInferenceBroker(rpcUrl, cid);
    const services = await broker.listService();

    const mapped: ServiceInfo[] = services.map((s: any) => ({
      provider: s.provider ?? s.appClientAddr,
      model: s.model ?? "unknown",
      appClientAddr: s.appClientAddr ?? s.provider,
    }));

    _cachedProviders = mapped;
    return mapped;
  })();

  try {
    return await _cachePromise;
  } catch (err) {
    // Reset so the next caller retries instead of getting a stale reject
    _cachePromise = null;
    console.warn(
      `[compute] Provider discovery failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

/**
 * Invalidate the cached provider list so the next call re-fetches from chain.
 */
export function invalidateProviderCache(): void {
  _cachedProviders = null;
  _cachePromise = null;
}

/**
 * Resolve a provider's inference URL from the on-chain registry.
 * Returns null for direct URLs (placeholder until SDK-based resolution is wired).
 *
 * @param providerAddress  Provider address (case-insensitive).
 * @param rpcUrl           Optional RPC URL for on-chain lookup.
 * @returns                Inference URL or `null`.
 */
export async function resolveProviderUrl(providerAddress: string, rpcUrl?: string): Promise<string | null> {
  // Resolve from on-chain registry for now — returns null for direct URLs
  return null;
}
