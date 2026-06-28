import { usePolledApi } from './usePolledApi.js';
import type { PerformanceMetrics } from '@axiom/config/types/performance';

interface BatchPerformanceResponse {
  results: Record<string, PerformanceMetrics>;
}

const NULL_METRICS: PerformanceMetrics = { totalTicks: 0, buyCount: 0, sellCount: 0, holdCount: 0, winRate: 0 };

/**
 * Batch-fetch performance metrics for multiple agents in a single API call.
 * Replaces N individual usePerformance calls with one request.
 */
export function usePerformanceBatch(tokenIds: readonly bigint[]): {
  data: Map<string, PerformanceMetrics>;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const ids = tokenIds.map(id => id.toString()).join(',');
  const enabled = tokenIds.length > 0;
  const url = enabled ? `/v1/agents/performance/batch?ids=${ids}` : '';

  const { data, isLoading, error, refetch } = usePolledApi<BatchPerformanceResponse>(url, {
    refetchInterval: 30_000,
    enabled,
    queryKey: ['performance-batch', ids],
  });

  const map = new Map<string, PerformanceMetrics>();
  if (data?.results) {
    for (const [key, value] of Object.entries(data.results)) {
      map.set(key, value ?? NULL_METRICS);
    }
  }

  return {
    data: map,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
