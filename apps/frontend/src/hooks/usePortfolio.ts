import { useMemo } from "react";
import { useAgents } from "./useAgents.js";
import { useVaultDataBatch, type VaultDataEntry } from "./useVaultDataBatch.js";
import { usePerformanceBatch } from "./usePerformanceBatch.js";
import type { PerformanceMetrics } from "@axiom/config/types/performance";

export interface PortfolioAgent {
  tokenId: bigint;
  owner: string;
  dataHash: string;
  uri: string;
  dataDescription?: string;
}

/** Single owner of the agent portfolio data sources (agents + vault + perf). */
export function usePortfolio(): {
  agents: PortfolioAgent[];
  isLoading: boolean;
  error: Error | null;
  vaultMap: Map<string, VaultDataEntry>;
  perfMap: Map<string, PerformanceMetrics>;
  loading: boolean;
} {
  const { agents, isLoading, error } = useAgents();
  const tokenIds = useMemo(() => agents.map((a) => a.tokenId), [agents]);
  const { data: vaultMap, isLoading: vaultLoading } =
    useVaultDataBatch(tokenIds);
  const { data: perfMap } = usePerformanceBatch(tokenIds);

  return {
    agents,
    isLoading,
    error,
    vaultMap,
    perfMap,
    loading: isLoading || vaultLoading,
  };
}
