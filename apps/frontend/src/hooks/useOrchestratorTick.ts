import { useCallback, useEffect, useRef, useState } from "react";
import { useAsyncAction } from "./useAsyncAction.js";
import { apiFetch, STREAM_TIMEOUT } from "../utils/apiFetch.js";
import { openStreamSocket } from "../config/env.js";
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

  // Debounced 50ms flush of ref→state so individual WebSocket tokens don't each trigger a re-render
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

          // the WS subscriber must exist BEFORE the stream POST — the
          // backend rejects stream requests with no subscriber
          // (400 NO_WS_SUBSCRIBER). The topic is deterministic
          // (`tick.${agentTokenId}` on both sides), openStreamSocket resolves
          // at onopen, and the server registers the subscriber synchronously
          // in its upgrade handler, so the POST below always sees it.
          const topic = `tick.${req.agentTokenId}`;
          const ws = await new Promise<WebSocket>((resolve, reject) => {
            let settled = false;
            const timeoutId = setTimeout(() => {
              settled = true;
              reject(
                new Error(
                  `WebSocket connection timed out after ${WS_CONNECTION_TIMEOUT_MS / 1000}s`,
                ),
              );
            }, WS_CONNECTION_TIMEOUT_MS);
            const onAbort = () => {
              settled = true;
              clearTimeout(timeoutId);
              reject(new DOMException("Aborted", "AbortError"));
            };
            combinedSignal.addEventListener("abort", onAbort, { once: true });
            openStreamSocket(topic).then(
              (socket) => {
                clearTimeout(timeoutId);
                combinedSignal.removeEventListener("abort", onAbort);
                if (settled) {
                  socket.close();
                  return;
                }
                settled = true;
                resolve(socket);
              },
              () => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutId);
                combinedSignal.removeEventListener("abort", onAbort);
                reject(
                  new Error("WebSocket connection failed for tick stream"),
                );
              },
            );
          });

          return await new Promise<TickResult>((resolve, reject) => {
            let accumulatedResult: Partial<TickResult> = {};
            let settled = false;
            wsRef.current = ws;

            const settle = (
              action: "resolve" | "reject",
              value: TickResult | Error,
            ) => {
              if (settled) return;
              settled = true;
              if (action === "resolve") {
                resolve(value as TickResult);
              } else {
                reject(value);
              }
            };

            const abortHandler = () => {
              ws.close();
              settle("reject", new DOMException("Aborted", "AbortError"));
            };
            combinedSignal.addEventListener("abort", abortHandler, {
              once: true,
            });

            const cleanup = () => {
              combinedSignal.removeEventListener("abort", abortHandler);
              if (wsRef.current === ws) {
                wsRef.current = null;
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
              cleanup();
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

            // Subscriber is registered and handlers are attached — start the
            // stream. Token frames can race the POST response (the backend
            // starts runTick before writing the 202), so this must come last.
            apiFetch<{ ok: boolean; streamTopic: string }>(
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
            )
              .then((initRes) => {
                if (!initRes.ok) {
                  ws.close();
                  settle("reject", new Error("Failed to start tick stream"));
                }
              })
              .catch((err: unknown) => {
                ws.close();
                settle(
                  "reject",
                  err instanceof Error ? err : new Error(String(err)),
                );
              });
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
