import { useMemo } from "react";
import { useAccount } from "wagmi";
import { usePolledApi } from "./usePolledApi.js";

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
  const { isConnected } = useAccount();
  const query = usePolledApi<{ services: Provider[] }>(
    "/v1/compute/providers",
    { enabled: isConnected, refetchInterval: POLL_INTERVAL_MS },
  );

  const emptyProviders = useMemo<Provider[]>(() => [], []);
  const providers = query.data?.services ?? emptyProviders;
  const refetch = query.refetch;

  const result = useMemo(
    () => ({
      providers,
      isLoading: query.isFetching,
      error: query.error,
      refetch: () => void refetch(),
    }),
    [providers, query.isFetching, query.error, refetch],
  );

  return result;
}
