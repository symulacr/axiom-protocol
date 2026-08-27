import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openStreamSocket } from "../config/env.js";
import { MAX_EVENTS, type AxiomEvent } from "./useEventHistory.js";

interface UseEventStreamResult {
  events: AxiomEvent[];
  isConnected: boolean;
}

interface UseEventStreamOptions {
  topics?: string[];
  enabled?: boolean;
}

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
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const maxReconnectDelay = 30000;
  const enabledRef = useRef(enabled);
  // Reused pending buffers (swap on flush): WS messages push here, a single
  // rAF per frame applies them to state — avoids per-message array spreads.
  const pendingRef = useRef<AxiomEvent[]>([]);
  const spareRef = useRef<AxiomEvent[]>([]);
  const flushRafRef = useRef<number | undefined>(undefined);
  // Set on unmount: a handshake resolving afterwards must be closed, not
  // attached (orphan), and must never schedule reconnects.
  const disposedRef = useRef(false);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const connectRef = useRef<() => void>(() => {});
  const scheduleReconnect = useCallback(() => {
    if (!enabledRef.current) return;
    if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) return;
    const delay = Math.min(
      1000 * Math.pow(2, reconnectAttemptRef.current),
      maxReconnectDelay,
    );
    reconnectAttemptRef.current++;
    reconnectTimerRef.current = setTimeout(() => connectRef.current(), delay);
  }, []);

  // Apply all buffered events as one state update; newest first, capped.
  const flushEvents = useCallback(() => {
    if (flushRafRef.current !== undefined) {
      cancelAnimationFrame(flushRafRef.current);
      flushRafRef.current = undefined;
    }
    const pending = pendingRef.current;
    if (pending.length === 0) return;
    const next = spareRef.current;
    next.length = 0;
    pendingRef.current = next;
    spareRef.current = pending;
    setEvents((prev) => {
      const total = Math.min(prev.length + pending.length, MAX_EVENTS);
      const merged: AxiomEvent[] = [];
      // Newest pending first, then previous events, capped at MAX_EVENTS.
      for (let i = pending.length - 1; i >= 0 && merged.length < total; i--) {
        const ev = pending[i];
        if (ev !== undefined) merged.push(ev);
      }
      for (let i = 0; i < prev.length && merged.length < total; i++) {
        const ev = prev[i];
        if (ev !== undefined) merged.push(ev);
      }
      return merged;
    });
  }, []);

  const connect = useCallback(() => {
    if (!enabled) return;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectAttemptRef.current = 0;

    const attach = (ws: WebSocket) => {
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

          pendingRef.current.push(event);
          if (flushRafRef.current === undefined) {
            flushRafRef.current = requestAnimationFrame(flushEvents);
          }
        } catch {
          return;
        }
      };

      ws.onclose = (e: CloseEvent) => {
        setIsConnected(false);
        if (wsRef.current === ws) wsRef.current = null;

        // Auth failures (1008 policy / 4401 custom) must not retry forever.
        if (e.code === 1008 || e.code === 4401) return;
        scheduleReconnect();
      };
    };

    openStreamSocket(topicsKey ? topicsKey.split(",") : [])
      .then((ws) => {
        if (disposedRef.current) {
          ws.close();
          return;
        }
        wsRef.current = ws;
        attach(ws);
      })
      .catch((err: unknown) => {
        // Handshake-stage failures never deliver a close code, so the
        // 1008/4401 guard in ws.onclose cannot see them. Detect the
        // missing-credential case and stop: retrying would hammer the
        // backend with guaranteed 401s forever.
        if (
          err instanceof Error &&
          err.message === "WS auth unavailable: no API key configured"
        ) {
          setIsConnected(false);
          return;
        }
        /* transient network failure — backoff and retry */
        scheduleReconnect();
      });
  }, [enabled, topicsKey, scheduleReconnect]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    disposedRef.current = false;
    enabledRef.current = enabled; // resync covers remount ordering
    connect();
    return () => {
      disposedRef.current = true;
      enabledRef.current = false; // kills scheduled reconnects
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      flushEvents(); // apply buffered events so teardown drops nothing
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect, flushEvents]);

  return { events, isConnected };
}
