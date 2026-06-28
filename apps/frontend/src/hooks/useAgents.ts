import { useAccount } from 'wagmi';
import { usePolledApi } from './usePolledApi.js';

export interface AgentInfo {
  tokenId: bigint;
  owner: string;
  dataHash: string;
  uri: string;
  dataDescription?: string;
}

interface AgentsApiResponse {
  agents: { tokenId: string; owner: string; dataHash: string; uri: string; dataDescription?: string }[];
}

export function useAgents(): {
  agents: AgentInfo[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { address } = useAccount();
  const { data, isLoading, error, refetch } = usePolledApi<AgentsApiResponse>(
    () => (address ? `/v1/agents?owner=${address}` : ''),
    {
      queryKey: ['agents', address],
      enabled: Boolean(address),
      refetchInterval: 30000,
    },
  );

  const agents: AgentInfo[] = (data?.agents ?? []).map(a => ({ ...a, tokenId: BigInt(a.tokenId) }));
  return { agents, isLoading, error, refetch: () => void refetch() };
}
