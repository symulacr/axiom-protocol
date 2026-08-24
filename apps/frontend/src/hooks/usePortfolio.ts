import { useMemo } from "react";
import { useAgents } from "./useAgents.js";
import { useVaultDataBatch, type VaultDataEntry } from "./useVaultDataBatch.js";

interface PortfolioAgent {
  tokenId: bigint;
  owner: string;
  dataDescription?: string;
}

/** Single owner of the agent portfolio data sources (agents + vault + perf). */
export function usePortfolio(): {
  agents: PortfolioAgent[];
  error: Error | null;
  vaultMap: Map<string, VaultDataEntry>;
  loading: boolean;
  refetch: () => void;
} {
  const { agents, isLoading, error, refetch: refetchAgents } = useAgents();
  const tokenIds = useMemo(() => agents.map((a) => a.tokenId), [agents]);
  const {
    data: vaultMap,
    isLoading: vaultLoading,
    refetch: refetchVaults,
  } = useVaultDataBatch(tokenIds);

  return {
    agents,
    error,
    vaultMap,
    loading: isLoading || vaultLoading,
    refetch: () => {
      refetchAgents();
      refetchVaults();
    },
  };
}
