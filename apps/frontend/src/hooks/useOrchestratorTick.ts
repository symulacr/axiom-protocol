import { useCallback, useEffect, useRef, useState } from 'react';
import { useAsyncAction } from './useAsyncAction.js';
import { apiFetch, STREAM_TIMEOUT } from '../utils/apiFetch.js';
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

export type TickStreamOptions = {
  /** Called for each text token received from the SSE stream */
  onChunk?: (token: string) => void;
  /** Optional external abort signal */
  signal?: AbortSignal;
};

export function useOrchestratorTick(): {
  tick: (req: TickRequest) => Promise<TickResult>;
  tickStream: (req: TickRequest, opts: TickStreamOptions) => Promise<TickResult>;
  cancelTick: () => void;
  isLoading: boolean;
  isStreaming: boolean;
  streamedTokens: string;
  streamingError: string | null;
  error: Error | null;
  resetStream: () => void;
} {
  const { execute, isLoading, error } = useAsyncAction();
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedTokens, setStreamedTokens] = useState('');
  const streamedRef = useRef('');
  const [streamingError, setStreamingError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const resetStream = useCallback(() => {
    setStreamedTokens('');
    streamedRef.current = '';
    setStreamingError(null);
  }, []);

  // Flush accumulated tokens from ref to state on a 50ms debounced interval
  // to avoid re-rendering on every individual WebSocket token.
  useEffect(() => {
    const flush = () => {
      const batch = streamedRef.current;
      if (batch) {
        streamedRef.current = '';
        const MAX_STREAMED_TOKENS = 50000;
        setStreamedTokens((prev) => {
          const next = prev + batch;
          return next.length > MAX_STREAMED_TOKENS
            ? next.slice(next.length - MAX_STREAMED_TOKENS)
            : next;
        });
      }
    };

    if (!isStreaming) {
      flush();
      return;
    }

    const id = setInterval(flush, 50);
    return () => {
      clearInterval(id);
      flush();
    };
  }, [isStreaming]);

  const tick = useCallback(
    async (req: TickRequest): Promise<TickResult> => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      return execute(async (signal) => {
        const combinedSignal = AbortSignal.any([signal, controller.signal]);
        const data = await apiFetch<TickResult>('/v1/orchestrator/tick', {
          method: 'POST',
          body: JSON.stringify(req),
          signal: combinedSignal,
          timeout: 30000,
        });
        return data;
      });
    },
    [execute],
  );

  const tickStream = useCallback(
    async (req: TickRequest, opts: TickStreamOptions): Promise<TickResult> => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsStreaming(true);
      setStreamedTokens('');
      streamedRef.current = '';
      setStreamingError(null);
      const onChunk = opts.onChunk ?? (() => {});
      try {
        return await execute(async (signal) => {
          const signals: AbortSignal[] = [signal, controller.signal, AbortSignal.timeout(STREAM_TIMEOUT)];
          if (opts.signal) signals.push(opts.signal);
          const combinedSignal = AbortSignal.any(signals);

          try {
            const initRes = await apiFetch<{ ok: boolean; streamTopic: string }>(
              '/v1/orchestrator/tick',
              {
                method: 'POST',
                body: JSON.stringify({ ...req, stream: true }),
                signal: combinedSignal,
                timeout: 5000,
                headers: {
                  'content-type': 'application/json',
                  accept: 'application/json',
                },
              },
            );

            if (!initRes.ok) throw new Error('Failed to start tick stream');
            const topic = initRes.streamTopic;

            const scheme = BACKEND_URL.startsWith('https://') ? 'wss' : 'ws';
            const wsUrl = new URL(
              BACKEND_URL.replace(/^https?:\/\//, `${scheme}://`) + '/v1/stream',
            );
            wsUrl.searchParams.append('topic', topic);

            return await new Promise<TickResult>((resolve, reject) => {
              const ws = new WebSocket(wsUrl.toString());
              let accumulatedResult: Partial<TickResult> = {};

              if (combinedSignal) {
                combinedSignal.addEventListener('abort', () => {
                  ws.close();
                  reject(new DOMException('Aborted', 'AbortError'));
                });
              }

              ws.onmessage = (msg: MessageEvent) => {
                try {
                  const data = JSON.parse(msg.data);
                  if (data.topic !== topic) return;
                  const payload = data.payload;

                  if (payload.type === 'token') {
                    onChunk(payload.content);
                    streamedRef.current += payload.content;
                  } else if (payload.type === 'complete') {
                    accumulatedResult = { ...payload };
                    ws.close();
                    resolve(accumulatedResult as TickResult);
                  } else if (payload.type === 'error') {
                    setStreamingError(payload.error);
                    ws.close();
                    reject(new Error(payload.error));
                  }
                } catch {
                  console.warn('[useOrchestratorTick] Unparseable WS message:', msg.data);
                  /* skip unparseable */
                }
              };

              ws.onerror = () => {
                ws.close();
                reject(new Error('WebSocket connection failed for tick stream'));
              };
            });
          } catch (err) {
            throw err;
          }


        });
      } finally {
        setIsStreaming(false);
      }
    },
    [execute],
  );

  const cancelTick = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  }, []);

  return { tick, tickStream, cancelTick, isLoading, isStreaming, streamedTokens, streamingError, error, resetStream };
}
