import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { BACKEND_URL } from '../config/env.js';
import { useAsyncAction } from './useAsyncAction.js';

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
      const res = await fetch(
        `${BACKEND_URL}/v1/agents?owner=${address}`,
        {
          headers: { accept: 'application/json' },
          signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
        },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `failed to fetch agents: ${res.status} ${res.statusText} ${text}`,
        );
      }
      const data = (await res.json()) as AgentsApiResponse;
      setAgents(data.agents ?? []);
    }).catch(() => {
      /* error is captured by useAsyncAction's internal error state */
    });
  }, [address, execute]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  return { agents, isLoading, error, refetch: fetchAgents };
}
