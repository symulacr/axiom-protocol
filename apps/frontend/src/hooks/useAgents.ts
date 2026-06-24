import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useAsyncAction } from './useAsyncAction.js';
import { apiFetch } from '../utils/apiFetch.js';

export interface AgentInfo {
  tokenId: string;
  owner: string;
  dataHash: string;
  uri: string;
}

interface AgentsApiResponse {
  agents: AgentInfo[];
}

export function useAgents(): {
  agents: AgentInfo[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { address } = useAccount();
  const { execute, isLoading, error } = useAsyncAction();
  const [agents, setAgents] = useState<AgentInfo[]>([]);

  const fetchAgents = useCallback(() => {
    if (!address) {
      setAgents([]);
      return;
    }
    execute(async (signal) => {
      const data = await apiFetch<AgentsApiResponse>(`/v1/agents?owner=${address}`, {
        signal,
        timeout: 10000,
      });
      setAgents(data.agents ?? []);
    }).catch(() => {});
  }, [address, execute]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  return { agents, isLoading, error, refetch: fetchAgents };
}
