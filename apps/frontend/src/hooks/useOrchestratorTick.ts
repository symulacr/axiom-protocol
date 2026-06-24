import { useCallback, useState } from 'react';
import { BACKEND_URL } from '../config/env.js';
import { useAsyncAction } from './useAsyncAction.js';

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

export type TickStreamOptions = {
  /** Called for each text token received from the SSE stream */
  onChunk: (token: string) => void;
  /** Optional external abort signal */
  signal?: AbortSignal;
};

export function useOrchestratorTick(): {
  tick: (req: TickRequest) => Promise<TickResult>;
  tickStream: (req: TickRequest, opts: TickStreamOptions) => Promise<TickResult>;
  isLoading: boolean;
  isStreaming: boolean;
  error: Error | null;
} {
  const { execute, isLoading, error } = useAsyncAction();
  const [isStreaming, setIsStreaming] = useState(false);

  const tick = useCallback(
    async (req: TickRequest): Promise<TickResult> => {
      return execute(async (signal) => {
        const res = await fetch(`${BACKEND_URL}/v1/orchestrator/tick`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify(req),
          signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(
            `orchestrator tick failed: ${res.status} ${res.statusText} ${text}`,
          );
        }
        const data = (await res.json()) as TickResult;
        return data;
      });
    },
    [execute],
  );

  const tickStream = useCallback(
    async (req: TickRequest, opts: TickStreamOptions): Promise<TickResult> => {
      setIsStreaming(true);
      try {
        return await execute(async (signal) => {
          const signals: AbortSignal[] = [signal, AbortSignal.timeout(120000)];
          if (opts.signal) signals.push(opts.signal);
          const combinedSignal = AbortSignal.any(signals);

          const res = await fetch(`${BACKEND_URL}/v1/orchestrator/tick`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'text/event-stream',
            },
            body: JSON.stringify({ ...req, stream: true }),
            signal: combinedSignal,
          });

          if (!res.ok) {
            const text = await res.text();
            throw new Error(
              `orchestrator tick stream failed: ${res.status} ${res.statusText} ${text}`,
            );
          }

          const contentType = res.headers.get('content-type') ?? '';
          if (!contentType.includes('text/event-stream')) {
            // Non-streaming fallback — parse as JSON
            const data = (await res.json()) as TickResult;
            opts.onChunk(data.rawModelOutput);
            return data;
          }

          // Read the response body as a SSE stream
          const reader = res.body?.getReader();
          if (!reader) {
            throw new Error('Response body is not readable');
          }

          const decoder = new TextDecoder();
          let buffer = '';
          let accumulatedResult: Partial<TickResult> = {};

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Split into lines — SSE events are line-oriented
            const parts = buffer.split('\n');
            buffer = parts.pop() ?? ''; // keep incomplete trailing part

            for (const line of parts) {
              const trimmed = line.trim();
              if (trimmed === '') continue; // blank line (event separator)
              if (!trimmed.startsWith('data: ')) continue;

              const payload = trimmed.slice(6);

              // Check for the [DONE] sentinel
              if (payload === '[DONE]') {
                return accumulatedResult as TickResult;
              }

              // Try to parse as JSON
              try {
                const parsed = JSON.parse(payload);

                // Extract text content from various SSE event shapes
                const content =
                  parsed.choices?.[0]?.delta?.content ??
                  parsed.choices?.[0]?.text ??
                  parsed.content ??
                  parsed.token ??
                  '';

                if (content) {
                  opts.onChunk(content);
                }

                // Accumulate partial TickResult fields
                if (parsed.recommendation) {
                  accumulatedResult.recommendation = parsed.recommendation;
                }
                if (parsed.rawModelOutput) {
                  accumulatedResult.rawModelOutput = parsed.rawModelOutput;
                }
                if (parsed.onchain) {
                  accumulatedResult.onchain = parsed.onchain;
                }
                if (parsed.storage) {
                  accumulatedResult.storage = parsed.storage;
                }
                if (parsed.execution !== undefined) {
                  accumulatedResult.execution = parsed.execution;
                }
                if (typeof parsed.durationMs === 'number') {
                  accumulatedResult.durationMs = parsed.durationMs;
                }
              } catch {
                // Not JSON — forward the raw text as a chunk
                opts.onChunk(payload);
              }
            }
          }

          // Stream ended without [DONE] sentinel
          if (Object.keys(accumulatedResult).length > 0) {
            return accumulatedResult as TickResult;
          }
          throw new Error('Stream ended without receiving data');
        });
      } finally {
        setIsStreaming(false);
      }
    },
    [execute],
  );

  return { tick, tickStream, isLoading, isStreaming, error };
}
