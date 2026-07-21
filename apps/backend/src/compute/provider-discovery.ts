import {
  getReadOnlyBroker,
  resolveChainId,
} from "./broker.js";
import { createLogger } from "../utils/logger.js";
import { extractErrorMessage } from "../utils/response.js";

const log = createLogger("provider-discovery");

export interface ServiceInfo {
  provider: string;
  model: string;
  uptime?: number;
  latency?: number;
}

export interface SelectProviderOptions {
  model?: string;
}

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
const CACHE_TTL_MS = 300_000;

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
    const services = await broker.listAvailableProviders();
    const mapped: ServiceInfo[] = services.map(
      (s: { provider?: string; model?: string; health?: { uptime: number; latency: number } }) => ({
        provider: s.provider ?? "",
        model: s.model ?? "unknown",
        ...(s.health ? { uptime: s.health.uptime, latency: s.health.latency } : {}),
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