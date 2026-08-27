import { useMemo } from "react";
import { useAccount } from "wagmi";
import { usePolledApi } from "./usePolledApi.js";

interface AgentInfo {
  tokenId: bigint;
  owner: string;
  dataDescription?: string;
}

interface AgentsApiResponse {
  agents: {
    tokenId: string;
    owner: string;
    dataDescription?: string;
  }[];
}

export function useAgents(): {
  agents: AgentInfo[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  /** Settled-and-successful: safe to conclude an absent id does not exist. */
  settled: boolean;
} {
  const { address } = useAccount();
  const { data, isLoading, error, refetch, isSuccess } =
    usePolledApi<AgentsApiResponse>(
      () => (address ? `/v1/agents?owner=${address}` : ""),
      {
        queryKey: ["agents", address],
        enabled: Boolean(address),
      },
    );

  const agents = useMemo<AgentInfo[]>(() => {
    return (data?.agents ?? []).map((a) => ({
      ...a,
      tokenId: BigInt(a.tokenId),
    }));
  }, [data?.agents]);

  return {
    agents,
    isLoading,
    error,
    refetch: () => void refetch(),
    settled: isSuccess,
  };
}
