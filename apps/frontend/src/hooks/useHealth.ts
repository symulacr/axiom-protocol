import { usePolledApi } from './usePolledApi.js';

export interface HealthResponse {
  ok: boolean;
  version: string;
  signer: string;
  chainHead: number;
  oracle: 'up' | 'down';
  addresses: Record<string, string> | null;
}

export function useHealth() {
  return usePolledApi<HealthResponse>('/health', { refetchInterval: 30_000 });
}
