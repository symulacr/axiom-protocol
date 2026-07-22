import { getComputeBaseUrl } from "./router.js";
import { createLogger } from "../utils/logger.js";

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

export async function discoverProviders(): Promise<ServiceInfo[]> {
  const baseUrl = getComputeBaseUrl();
  const res = await fetch(`${baseUrl}/v1/providers`);
  if (!res.ok) {
    log.warn("Provider discovery failed", { status: res.status });
    return [];
  }
  const services = (await res.json()) as Array<{ provider?: string; model?: string; health?: { uptime: number; latency: number } }>;
  const mapped: ServiceInfo[] = (services ?? []).map(
    (s: { provider?: string; model?: string; health?: { uptime: number; latency: number } }) => ({
      provider: s.provider ?? "",
      model: s.model ?? "unknown",
      ...(s.health ? { uptime: s.health.uptime, latency: s.health.latency } : {}),
    }),
  );
  return mapped;
}