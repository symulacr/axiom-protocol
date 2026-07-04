import { useMemo } from "react";
import { usePolledApi } from "./usePolledApi.js";
import type {
  PerformanceMetrics,
  TradeHistoryEntry,
} from "@axiom/config/types/performance";

export type { PerformanceMetrics, TradeHistoryEntry };

interface PerformanceResponse {
  metrics: PerformanceMetrics;
  history: TradeHistoryEntry[];
}

export interface UsePerformanceResult {
  metrics: PerformanceMetrics | null;
  history: TradeHistoryEntry[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function usePerformance(tokenId: bigint | null): UsePerformanceResult {
  const enabled = tokenId !== null && tokenId > 0n;
  const url = enabled ? `/v1/agents/${tokenId.toString()}/performance` : "";

  const { data, isLoading, error, refetch } = usePolledApi<PerformanceResponse>(
    url,
    {
      refetchInterval: 30_000,
      enabled,
      queryKey: ["performance", tokenId?.toString()],
    },
  );

  const emptyHistory = useMemo<TradeHistoryEntry[]>(() => [], []);
  const metrics = data?.metrics ?? null;
  const history = data?.history ?? emptyHistory;

  const result = useMemo(
    () => ({
      metrics,
      history,
      isLoading,
      error: error as Error | null,
      refetch,
    }),
    [metrics, history, isLoading, error, refetch],
  );

  return result;
}
