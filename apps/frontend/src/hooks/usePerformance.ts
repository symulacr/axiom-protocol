import { useMemo } from "react";
import { useAccount } from "wagmi";
import { usePolledApi } from "./usePolledApi.js";
import type { PerformanceMetrics } from "@axiom/config/types/performance";

export type { PerformanceMetrics };

interface PerformanceResponse {
  metrics: PerformanceMetrics;
}

/** Per-agent tick metrics; the only consumer-facing field (AgentPage fact row). */
export function usePerformance(tokenId: bigint | null): {
  metrics: PerformanceMetrics | null;
} {
  const { isConnected } = useAccount();
  const enabled = isConnected && tokenId !== null && tokenId > 0n;
  const url = enabled ? `/v1/agents/${tokenId.toString()}/performance` : "";

  const { data } = usePolledApi<PerformanceResponse>(url, {
    enabled,
    queryKey: ["performance", tokenId?.toString()],
  });

  const metrics = data?.metrics ?? null;
  return useMemo(() => ({ metrics }), [metrics]);
}
