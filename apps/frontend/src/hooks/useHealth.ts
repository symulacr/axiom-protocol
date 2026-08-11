import { useAccount } from "wagmi";
import { usePolledApi } from "./usePolledApi.js";

interface HealthResponse {
  ok: boolean;
  version: string;
  signer: string;
  chainHead: number;
  oracle: "up" | "down";
  addresses: Record<string, string> | null;
}

interface UseHealthOptions {
  enabled?: boolean;
}

export function useHealth(options?: UseHealthOptions) {
  const { isConnected } = useAccount();
  const { enabled = true } = options ?? {};
  return usePolledApi<HealthResponse>("/health", {
    enabled: enabled && isConnected,
  });
}
