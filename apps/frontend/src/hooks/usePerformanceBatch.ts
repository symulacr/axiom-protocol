import { useMemo } from "react";
import { useAccount } from "wagmi";
import { usePolledApi } from "./usePolledApi.js";
import type { PerformanceMetrics } from "@axiom/config/types/performance";

interface BatchPerformanceResponse {
  results: Record<string, PerformanceMetrics>;
}

const NULL_METRICS: PerformanceMetrics = {
  totalTicks: 0,
  buyCount: 0,
  sellCount: 0,
  holdCount: 0,
  buyRate: 0,
  winRate: 0,
};

export function usePerformanceBatch(tokenIds: readonly bigint[]): {
  data: Map<string, PerformanceMetrics>;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { isConnected } = useAccount();
  const ids = tokenIds.map((id) => id.toString()).join(",");
  const enabled = isConnected && tokenIds.length > 0;
  const url = enabled ? `/v1/agents/performance/batch?ids=${ids}` : "";

  const { data, isLoading, error, refetch } =
    usePolledApi<BatchPerformanceResponse>(url, {
      enabled,
      queryKey: ["performance-batch", ids],
    });

  const dataMap = useMemo(() => {
    const map = new Map<string, PerformanceMetrics>();
    if (data?.results) {
      for (const [key, value] of Object.entries(data.results)) {
        map.set(key, value ?? NULL_METRICS);
      }
    }
    return map;
  }, [data?.results]);

  return {
    data: dataMap,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
