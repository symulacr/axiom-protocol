import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_KEY, backendWsBase, backendWsPathPrefix } from "../config/env.js";
import type { AxiomEvent } from "./useEventHistory.js";

interface UseEventStreamResult {
  events: AxiomEvent[];
  isConnected: boolean;
  error: Event | null;
  reconnect: () => void;
}

interface UseEventStreamOptions {
  topics?: string[];
  enabled?: boolean;
}

const MAX_EVENTS = 500;
const MAX_RECONNECT_ATTEMPTS = 8;

export function useEventStream(
  options: UseEventStreamOptions = {},
): UseEventStreamResult {
  const { topics = [], enabled = true } = options;
  const topicsKey = useMemo(() => topics.join(","), [topics]);
  const [events, setEvents] = useState<AxiomEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Event | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const maxReconnectDelay = 30000;
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const connect = useCallback(() => {
    if (!enabled) return;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectAttemptRef.current = 0;

    try {
      const url = new URL(
        `${backendWsBase()}${backendWsPathPrefix()}/v1/stream`,
      );
      for (const t of topics) {
        url.searchParams.append("topic", t);
      }
      url.searchParams.append("token", API_KEY);

      const ws = new WebSocket(url.toString());
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        setIsConnected(true);
        setError(null);
      };

      ws.onmessage = (msg: MessageEvent) => {
        try {
          const data = JSON.parse(msg.data);
					if (data.topic === "hello") return;

          const event: AxiomEvent = {
            source: data.payload?.source ?? "ws",
            chainId: data.payload?.chainId ?? 0,
            blockNumber: data.payload?.blockNumber ?? 0,
            txHash: data.payload?.txHash ?? "",
            logIndex: data.payload?.logIndex ?? 0,
            eventName: data.topic,
            payload: data.payload ?? {},
            receivedAt: data.ts ?? Date.now(),
            timestamp: data.ts ?? Date.now(),
          };

          setEvents((prev) => {
            const next = [event, ...prev];
						return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
          });
        } catch {
          return;
        }
      };

      ws.onerror = () => {
        ws.close();
        wsRef.current = null;
      };

      ws.onclose = (e: CloseEvent) => {
        setIsConnected(false);
        wsRef.current = null;
        if (!enabledRef.current) return;

        // Auth failures (1008 policy / 4401 custom) must not retry forever.
        const isAuthClose = e.code === 1008 || e.code === 4401;
        if (isAuthClose) {
          setError(new Event("WebSocket closed: unauthorized"));
          return;
        }
        if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
          setError(new Event("WebSocket connection failed after retries"));
          return;
        }

        const delay = Math.min(
          1000 * Math.pow(2, reconnectAttemptRef.current),
          maxReconnectDelay,
        );
        reconnectAttemptRef.current++;
        reconnectTimerRef.current = setTimeout(connect, delay);
      };
    } catch (err) {
      setError(err instanceof Event ? err : new Event("connection failed"));
    }
  }, [enabled, topicsKey]);

  const reconnect = useCallback(() => {
    reconnectAttemptRef.current = 0;
    setError(null);
    connect();
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  return { events, isConnected, error, reconnect };
}
