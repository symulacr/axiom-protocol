import { usePolledApi } from "./usePolledApi.js";

export type ProviderTrustMode = "standard" | "verified" | "private";

export interface ComputeProvider {
  address: string;
  model: string;
  endpoint?: string;
  price?: string;
  /** Router latency ms; null = no recent routing samples. */
  latencyMs?: number | null;
  /** USD per token (router `pricing_usd`); undefined on the legacy list. */
  pricingUsd?: {
    prompt?: string;
    completion?: string;
    cached?: string;
  };
  trustMode?: ProviderTrustMode;
  providerName?: string | null;
  providerCountry?: string | null;
  isHealthy?: boolean;
  uptime?: number | null;
}

interface ProvidersResponse {
  services: ComputeProvider[];
}

/** Normalize a backend provider object (verbatim router fields) into the
 * client shape. The ?model= passthrough adds `model`/`trust_mode`; legacy
 * items carry only address/model/endpoint/price. */
export function normalizeProviders(
  services: unknown[] | undefined,
): ComputeProvider[] {
  if (!Array.isArray(services)) return [];
  return services
    .filter(
      (s): s is Record<string, unknown> => typeof s === "object" && s !== null,
    )
    .map((p) => {
      const pricing = p.pricing_usd as Record<string, unknown> | undefined;
      const trust = p.trust_mode;
      const out: ComputeProvider = {
        address: String(p.address ?? ""),
        model: String(p.model ?? p.model_id ?? ""),
        latencyMs: typeof p.latency === "number" ? p.latency : null,
        uptime: typeof p.uptime === "number" ? p.uptime : null,
        isHealthy: typeof p.is_healthy === "boolean" ? p.is_healthy : undefined,
        trustMode:
          trust === "standard" || trust === "verified" || trust === "private"
            ? trust
            : undefined,
      };
      if (typeof p.endpoint === "string") out.endpoint = p.endpoint;
      if (typeof p.price === "string") out.price = p.price;
      if (pricing && typeof pricing === "object") {
        out.pricingUsd = {
          prompt:
            typeof pricing.prompt === "string" ? pricing.prompt : undefined,
          completion:
            typeof pricing.completion === "string"
              ? pricing.completion
              : undefined,
          cached:
            typeof pricing.cached_prompt === "string"
              ? pricing.cached_prompt
              : undefined,
        };
      }
      if (typeof p.provider_name === "string")
        out.providerName = p.provider_name;
      if (typeof p.provider_country === "string")
        out.providerCountry = p.provider_country;
      return out;
    });
}

/**
 * 0G compute providers from GET /v1/compute/providers.
 * Pass `model` to hit the ?model= passthrough (real provider objects with
 * latency/pricing/trust); omit it for the legacy model-id pseudo-address list.
 * Backend caches the upstream router list for 60s, so poll at the same cadence.
 */
export function useProviders(model?: string) {
  const url = model
    ? `/v1/compute/providers?model=${encodeURIComponent(model)}`
    : "/v1/compute/providers";
  return usePolledApi<ProvidersResponse>(url, {
    refetchInterval: 60_000,
    queryKey: ["compute-providers", model ?? "all"],
  });
}
