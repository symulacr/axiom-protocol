import { usePolledApi } from "./usePolledApi.js";

export interface ComputeProvider {
  address: string;
  model: string;
  endpoint?: string;
  price?: string;
}

interface ProvidersResponse {
  services: ComputeProvider[];
}

/**
 * 0G compute providers (router models) from GET /v1/compute/providers.
 * Backend caches the upstream router list for 60s, so poll at the same cadence.
 */
export function useProviders() {
  return usePolledApi<ProvidersResponse>("/v1/compute/providers", {
    refetchInterval: 60_000,
  });
}
