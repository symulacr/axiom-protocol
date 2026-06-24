// ─── On-chain compute provider discovery ───────────────────────────────────
//
// Instead of hardcoding provider URLs, query the on-chain InferenceServing
// broker contract.  Results are cached for process lifetime so the RPC is
// called at most once.
//
// If the RPC call fails (network unavailable, chain not deployed), the cache
// stays empty and callers receive an empty list / null.

import { ethers, FetchRequest, JsonRpcProvider } from "ethers";
import { GALILEO_CHAIN_ID, resolveRpcUrl } from "@axiom/config/networks";

// ---------------------------------------------------------------------------
// Broker contract addresses per chain
// ---------------------------------------------------------------------------
// Galileo testnet: confirmed at 0xa79F4c8311FF93C06b8CfB403690cc987c93F91E
// Aristotle mainnet: TBD — add when the deployment script outputs the address
const BROKER_ADDRESSES: Record<number, string> = {
  [GALILEO_CHAIN_ID]: "0xa79F4c8311FF93C06b8CfB403690cc987c93F91E",
};

// ---------------------------------------------------------------------------
// Minimal ABI — only the fields we need for provider routing
// ---------------------------------------------------------------------------
const INFERENCE_SERVING_ABI = [
  "function getAllServices(uint256 offset, uint256 limit) view returns (tuple(address provider, string model, string url, uint256 stake, bool active)[] services, uint256 total)",
] as const;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------
export interface ServiceInfo {
  /** Provider on-chain address (lowercased). */
  provider: string;
  /** Model identifier (e.g. "qwen2.5-omni-7b"). */
  model: string;
  /** Inference endpoint URL. */
  url: string;
  /** Provider stake (wei). */
  stake: bigint;
  /** Whether the provider is currently active. */
  active: boolean;
}

// ---------------------------------------------------------------------------
// Lazy process-lifetime cache
// ---------------------------------------------------------------------------
let _cachedProviders: ServiceInfo[] | null = null;
let _cachePromise: Promise<ServiceInfo[]> | null = null;

/**
 * Discover compute providers by calling `InferenceServing.getAllServices()`
 * on-chain.  The result is cached for the lifetime of the process.
 *
 * @param chainId  Optional chain ID (defaults to `AXIOM_CHAIN_ID` env or Galileo).
 * @returns        List of active `ServiceInfo` records (empty on failure).
 */
export async function discoverProviders(chainId?: number): Promise<ServiceInfo[]> {
  if (_cachedProviders) return _cachedProviders;
  if (_cachePromise) return _cachePromise;

  _cachePromise = (async (): Promise<ServiceInfo[]> => {
    const cid = chainId ?? (Number(process.env.AXIOM_CHAIN_ID) || GALILEO_CHAIN_ID);
    const brokerAddr = BROKER_ADDRESSES[cid];
    if (!brokerAddr) {
      console.warn(`[compute] No InferenceServing broker for chain ${cid}; provider list empty`);
      _cachedProviders = [];
      return _cachedProviders;
    }

    const rpcUrl = resolveRpcUrl(cid);
    const fetchReq = new FetchRequest(rpcUrl);
    fetchReq.timeout = 10_000;
    const provider = new JsonRpcProvider(fetchReq, cid, { staticNetwork: true });

    const iface = new ethers.Interface(INFERENCE_SERVING_ABI);
    const data = iface.encodeFunctionData("getAllServices", [0n, 100n]);
    const result = await provider.call({ to: brokerAddr, data });
    const decoded = iface.decodeFunctionResult("getAllServices", result);

    const rawServices = decoded.services as Array<{
      provider: string;
      model: string;
      url: string;
      stake: bigint;
      active: boolean;
    }>;

    const services: ServiceInfo[] = rawServices
      .filter((s) => s.active)
      .map((s) => ({
        provider: s.provider.toLowerCase(),
        model: s.model,
        url: s.url,
        stake: s.stake,
        active: s.active,
      }));

    _cachedProviders = services;
    return services;
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
 * Resolve a provider's inference URL from the on-chain cache.
 *
 * @param providerAddress  Provider address (case-insensitive).
 * @returns                Inference URL or `null` if the provider is not registered.
 */
export async function resolveProviderUrl(providerAddress: string): Promise<string | null> {
  const providers = await discoverProviders();
  const addr = providerAddress.toLowerCase();
  const match = providers.find((s) => s.provider === addr);
  return match?.url ?? null;
}
