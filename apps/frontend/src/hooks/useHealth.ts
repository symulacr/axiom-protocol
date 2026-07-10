import { useAccount } from "wagmi";
import { usePolledApi } from "./usePolledApi.js";

export interface HealthResponse {
  ok: boolean;
  version: string;
  signer: string;
  chainHead: number;
  oracle: "up" | "down";
  addresses: Record<string, string> | null;
}

export interface UseHealthOptions {
  enabled?: boolean;
}

export function useHealth(options?: UseHealthOptions) {
  const { isConnected } = useAccount();
  const { enabled = true } = options ?? {};
  return usePolledApi<HealthResponse>("/health", {
    refetchInterval: 30_000,
    enabled: enabled && isConnected,
  });
}
