import { useCallback, useState } from 'react';

/**
 * Request body posted to the Axiom backend orchestrator tick endpoint.
 * The backend runs one cycle of a strategy against the connected vault /
 * agent on 0G, then returns the on-chain and off-chain effects.
 */
export type TickRequest = {
  /** AxiomStrategyVault address. */
  vault: `0x${string}`;
  /** AxiomAgentNFT contract address. */
  agentNft: `0x${string}`;
  /** Token id of the agent to run the strategy against. */
  agentTokenId: string;
  /** Optional strategy hint passed through in the market signal. */
  strategy?: string;
  /** Optional signal source label; defaults to "manual:user". */
  signalSource?: string;
  /** Optional arbitrary payload for the market signal. */
  signalPayload?: unknown;
};

export type TickResult = {
  /** The model's recommendation as a JSON-parsed object. */
  recommendation: { action: 'buy' | 'sell' | 'hold'; amount?: number; reason: string };
  /** Raw model output (string). */
  rawModelOutput: string;
  /** On-chain state snapshot (vault balance, recent events). */
  onchain: { vaultBalance: string; recentEvents: unknown[] };
  /** Storage peek result. */
  storage: { rootHash: `0x${string}`; size: number };
  /**
   * On-chain settlement result when the recommendation is acted on
   * (buy/sell). Absent for "hold" recommendations. The backend serializes
   * `bigint` fields (gasUsed) as decimal strings on the wire via its
   * `bigintReplacer`, so `gasUsed` is typed as `string` here, not `bigint`.
   */
  execution?: {
    txHash: `0x${string}`;
    action: string;
    target: `0x${string}`;
    success: boolean;
    result?: `0x${string}`;
    gasUsed?: string;
  };
  /** Total wall-clock duration of the tick. */
  durationMs: number;
};

/**
 * Hook that POSTs to the backend orchestrator tick endpoint via the native
 * browser Fetch API. No wagmi / viem dependency — the backend wallet signs
 * the on-chain execute() call; the frontend is a thin client.
 *
 * Backend base URL is read from Vite's `VITE_BACKEND_URL` env var (the
 * `VITE_` prefix keeps the value out of the server bundle and makes it
 * visible to the browser, per the Vite convention). Falls back to the
 * local dev loopback port used by `apps/backend` (`pnpm dev` → :3000).
 *
 * Canonical references:
 *  - MDN Fetch API: Request/Response, JSON body, error handling:
 *    https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
 *  - Vite environment variables (VITE_ prefix):
 *    https://vitejs.dev/guide/env-and-mode
 */
const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:3000';

export function useOrchestratorTick(): {
  tick: (req: TickRequest) => Promise<TickResult>;
  isLoading: boolean;
  error: Error | null;
} {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const tick = useCallback(
    async (req: TickRequest): Promise<TickResult> => {
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
          signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) {
          // Surface the response status + body as an Error so the UI can
          // // render it; the backend returns JSON `{ error: string }`.
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
