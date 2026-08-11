import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildStreamWsUrl } from "../config/env.js";
import type { AxiomEvent } from "./useEventHistory.js";

interface UseEventStreamResult {
  events: AxiomEvent[];
  isConnected: boolean;
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
      const url = buildStreamWsUrl(topics);

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        setIsConnected(true);
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
        if (e.code === 1008 || e.code === 4401) return;
        if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) return;

        const delay = Math.min(
          1000 * Math.pow(2, reconnectAttemptRef.current),
          maxReconnectDelay,
        );
        reconnectAttemptRef.current++;
        reconnectTimerRef.current = setTimeout(connect, delay);
      };
    } catch {
      return;
    }
  }, [enabled, topicsKey]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  return { events, isConnected };
}
