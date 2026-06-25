import { usePolledApi } from './usePolledApi.js';

export type Provider = {
  address: `0x${string}`;
  model: string;
  endpoint: string;
  price?: string;
};

const POLL_INTERVAL_MS = 30_000;

export function useProviders(): {
  providers: Provider[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const query = usePolledApi<{ services: Provider[] }>(
    '/v1/compute/providers',
    { refetchInterval: POLL_INTERVAL_MS },
  );

  return {
    providers: query.data?.services ?? [],
    isLoading: query.isFetching,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}
