import { useCallback, useEffect, useRef, useState } from "react";
import { useAsyncAction } from "./useAsyncAction.js";
import { apiFetch, STREAM_TIMEOUT } from "../utils/apiFetch.js";
import { API_KEY, backendWsBase, backendWsPathPrefix } from "../config/env.js";
import type {
  TickRequest,
  TickResult,
  TickStreamOptions,
} from "@axiom/config/types/orchestrator";
export type { TickRequest, TickResult, TickStreamOptions };

const WS_CONNECTION_TIMEOUT_MS = 60_000;

export function useOrchestratorTick(): {
  tick: (req: TickRequest) => Promise<TickResult>;
  tickStream: (
    req: TickRequest,
    opts: TickStreamOptions,
  ) => Promise<TickResult>;
  cancelTick: () => void;
  isLoading: boolean;
  isStreaming: boolean;
  streamedTokens: string;
  streamingError: string | null;
  error: Error | null;
  resetStream: () => void;
} {
  const { execute, cancel, isLoading, error } = useAsyncAction();
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedTokens, setStreamedTokens] = useState("");
  const streamedRef = useRef("");
  const [streamingError, setStreamingError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
      cancel();
    };
  }, [cancel]);

  const resetStream = useCallback(() => {
    setStreamedTokens("");
    streamedRef.current = "";
    setStreamingError(null);
  }, []);

  // Flush accumulated tokens from ref to state on a 50ms debounced interval
  // to avoid re-rendering on every individual WebSocket token.
  useEffect(() => {
    const flush = () => {
      const batch = streamedRef.current;
      if (batch) {
        streamedRef.current = "";
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
      return execute(async (signal) => {
        return apiFetch<TickResult>("/v1/orchestrator/tick", {
          method: "POST",
          body: JSON.stringify(req),
          signal,
          timeout: 30000,
        });
      });
    },
    [execute],
  );

  const tickStream = useCallback(
    async (req: TickRequest, opts: TickStreamOptions): Promise<TickResult> => {
      setIsStreaming(true);
      setStreamedTokens("");
      streamedRef.current = "";
      setStreamingError(null);
      const onChunk = opts.onChunk ?? (() => {});
      try {
        return await execute(async (signal) => {
          const signals: AbortSignal[] = [
            signal,
            AbortSignal.timeout(STREAM_TIMEOUT),
          ];
          if (opts.signal) signals.push(opts.signal);
          const combinedSignal = AbortSignal.any(signals);

          const initRes = await apiFetch<{ ok: boolean; streamTopic: string }>(
            "/v1/orchestrator/tick",
            {
              method: "POST",
              body: JSON.stringify({ ...req, stream: true }),
              signal: combinedSignal,
              timeout: 5000,
              headers: {
                "content-type": "application/json",
                accept: "application/json",
              },
            },
          );

          if (!initRes.ok) throw new Error("Failed to start tick stream");
          const topic = initRes.streamTopic;

          const wsUrl = new URL(
            `${backendWsBase()}${backendWsPathPrefix()}/v1/stream`,
          );
          wsUrl.searchParams.append("topic", topic);
          wsUrl.searchParams.append("token", API_KEY);

          return await new Promise<TickResult>((resolve, reject) => {
            const ws = new WebSocket(wsUrl.toString());
            wsRef.current = ws;
            let accumulatedResult: Partial<TickResult> = {};
            let settled = false;
            let connectionTimeoutId: ReturnType<typeof setTimeout> | undefined;

            const cleanup = () => {
              if (connectionTimeoutId !== undefined) {
                clearTimeout(connectionTimeoutId);
                connectionTimeoutId = undefined;
              }
              if (wsRef.current === ws) {
                wsRef.current = null;
              }
            };

            const settle = (
              action: "resolve" | "reject",
              value: TickResult | Error,
            ) => {
              if (settled) return;
              settled = true;
              cleanup();
              if (action === "resolve") {
                resolve(value as TickResult);
              } else {
                reject(value);
              }
            };

            connectionTimeoutId = setTimeout(() => {
              if (ws.readyState === WebSocket.CONNECTING) {
                ws.close();
                settle(
                  "reject",
                  new Error(
                    `WebSocket connection timed out after ${WS_CONNECTION_TIMEOUT_MS / 1000}s`,
                  ),
                );
              }
            }, WS_CONNECTION_TIMEOUT_MS);

            combinedSignal.addEventListener(
              "abort",
              () => {
                ws.close();
                settle("reject", new DOMException("Aborted", "AbortError"));
              },
              { once: true },
            );

            ws.onopen = () => {
              if (connectionTimeoutId !== undefined) {
                clearTimeout(connectionTimeoutId);
                connectionTimeoutId = undefined;
              }
            };

            ws.onmessage = (msg: MessageEvent) => {
              try {
                const data = JSON.parse(msg.data);
                if (data.topic !== topic) return;
                const payload = data.payload;

                if (payload.type === "token") {
                  onChunk(payload.content);
                  streamedRef.current += payload.content;
                } else if (payload.type === "complete") {
                  accumulatedResult = { ...payload };
                  ws.close();
                  settle("resolve", accumulatedResult as TickResult);
                } else if (payload.type === "error") {
                  setStreamingError(payload.error);
                  ws.close();
                  settle("reject", new Error(payload.error));
                }
              } catch {
                return;
              }
            };

            ws.onerror = () => {
              ws.close();
              settle(
                "reject",
                new Error("WebSocket connection failed for tick stream"),
              );
            };

            ws.onclose = (event) => {
              if (settled) return;
              let detail = "";
              if (event.reason) {
                detail = `: ${event.reason}`;
              } else if (event.code !== 1000) {
                detail = ` (code ${event.code})`;
              }
              settle(
                "reject",
                new Error(
                  `WebSocket closed before tick stream completed${detail}`,
                ),
              );
            };
          });
        });
      } finally {
        setIsStreaming(false);
      }
    },
    [execute],
  );

  const cancelTick = useCallback(() => {
    cancel();
    wsRef.current?.close();
    wsRef.current = null;
    setIsStreaming(false);
  }, [cancel]);

  return {
    tick,
    tickStream,
    cancelTick,
    isLoading,
    isStreaming,
    streamedTokens,
    streamingError,
    error,
    resetStream,
  };
}
