import { useState } from 'react';
import { usePoll } from './usePoll.js';
import { apiFetch } from '../utils/apiFetch.js';

export type Provider = {
  address: `0x${string}`;
  model: string;
  endpoint: string;
};

const POLL_INTERVAL_MS = 30_000;

export function useProviders(): {
  providers: Provider[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const { isLoading, refetch } = usePoll(
    async (signal): Promise<Provider[]> => {
      const { services } = await apiFetch<{ services: Provider[] }>('/v1/compute/providers', {
        method: 'GET',
        signal,
        timeout: 10000,
      });
      return services;
    },
    setProviders,
    setError,
    { intervalMs: POLL_INTERVAL_MS },
  );

  return { providers, isLoading, error, refetch };
}
