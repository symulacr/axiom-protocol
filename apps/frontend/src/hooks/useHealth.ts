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

export function useHealth() {
  const { isConnected } = useAccount();
  return usePolledApi<HealthResponse>("/health", {
    enabled: isConnected,
  });
}
