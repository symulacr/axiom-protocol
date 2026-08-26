import { useAccount } from "wagmi";
import { usePolledApi } from "./usePolledApi.js";

interface HealthResponse {
  ok: boolean;
}

export function useHealth() {
  const { isConnected } = useAccount();
  return usePolledApi<HealthResponse>("/health", {
    enabled: isConnected,
  });
}
