import { useCallback, useEffect, useRef, useState } from 'react';
import { BACKEND_URL } from '../config/env.js';

export type TickRequest = {
  vault: `0x${string}`;
  agentNft: `0x${string}`;
  agentTokenId: string;
  strategy?: string;
  signalSource?: string;
  signalPayload?: unknown;
};

export type TickResult = {
  recommendation: { action: 'buy' | 'sell' | 'hold'; amount?: number; reason: string };
  rawModelOutput: string;
  onchain: { vaultBalance: string; recentEvents: unknown[] };
  storage: { rootHash: `0x${string}`; size: number };
  /** Present for buy/sell; absent for "hold". `gasUsed` is string (backend serialises bigint as decimal). */
  execution?: {
    txHash: `0x${string}`;
    action: string;
    target: `0x${string}`;
    success: boolean;
    result?: `0x${string}`;
    gasUsed?: string;
  };
  durationMs: number;
};

export function useOrchestratorTick(): {
  tick: (req: TickRequest) => Promise<TickResult>;
  isLoading: boolean;
  error: Error | null;
} {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const tick = useCallback(
    async (req: TickRequest): Promise<TickResult> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${BACKEND_URL}/v1/orchestrator/tick`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify(req),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(
            `orchestrator tick failed: ${res.status} ${res.statusText} ${text}`,
          );
        }
        const data = (await res.json()) as TickResult;
        return data;
      } catch (err) {
        const wrapped = err instanceof Error ? err : new Error(String(err));
        setError(wrapped);
        throw wrapped;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return { tick, isLoading, error };
}
