import { useMemo } from "react";
import { useAccount } from "wagmi";
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

interface UsePerformanceResult {
  metrics: PerformanceMetrics | null;
  history: TradeHistoryEntry[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

interface UsePerformanceOptions {
  enabled?: boolean;
}

export function usePerformance(
  tokenId: bigint | null,
  options?: UsePerformanceOptions,
): UsePerformanceResult {
  const { isConnected } = useAccount();
  const { enabled: enabledOption = true } = options ?? {};
  const enabled = enabledOption && isConnected && tokenId !== null && tokenId > 0n;
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
