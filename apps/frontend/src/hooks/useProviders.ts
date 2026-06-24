import { useState } from 'react';
import { BACKEND_URL } from '../config/env.js';
import { usePoll } from './usePoll.js';

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
      const res = await fetch(`${BACKEND_URL}/v1/compute/providers`, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `providers fetch failed: ${res.status} ${res.statusText} ${text}`,
        );
      }
      const { services } = (await res.json()) as { services: Provider[] };
      return services;
    },
    setProviders,
    setError,
    { intervalMs: POLL_INTERVAL_MS },
  );

  return { providers, isLoading, error, refetch };
}
