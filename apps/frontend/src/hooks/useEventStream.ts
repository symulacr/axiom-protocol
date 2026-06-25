import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BACKEND_URL } from '../config/env.js';
import type { AxiomEvent } from './useEventHistory.js';

export interface UseEventStreamResult {
  events: AxiomEvent[];
  isConnected: boolean;
  error: Event | null;
}

export interface UseEventStreamOptions {
  /** Topic sub-string filters forwarded as `?topic=` query params. */
  topics?: string[];
  /** When `false`, the hook neither connects nor schedules any
   *  reconnect. Default `true`. */
  enabled?: boolean;
}

const MAX_EVENTS = 500;

/**
 * Subscribe to the backend WebSocket event stream.
 * Forwards incoming JSON into the standard `AxiomEvent` shape.
 */
export function useEventStream(
  options: UseEventStreamOptions = {},
): UseEventStreamResult {
  const { topics = [], enabled = true } = options;
  const topicsKey = useMemo(() => topics.join(','), [topics]);
  const [events, setEvents] = useState<AxiomEvent[]>([]);
  const eventsRef = useRef<AxiomEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Event | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const maxReconnectDelay = 30000;
  const enabledRef = useRef(enabled);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  const connect = useCallback(() => {
    if (!enabled) return;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectAttemptRef.current = 0;

    // Topic supports wildcards: 'tick.*' subscribes to all tick topics.
    const scheme = BACKEND_URL.startsWith('https://') ? 'wss' : 'ws';
    const url = new URL(BACKEND_URL.replace(/^https?:\/\//, `${scheme}://`) + '/v1/stream');
    for (const t of topics) {
      url.searchParams.append('topic', t);
    }

    try {
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
          if (data.topic === 'hello') return; // connection handshake

          const event: AxiomEvent = {
            source: data.payload?.source ?? 'ws',
            chainId: data.payload?.chainId ?? 0,
            blockNumber: data.payload?.blockNumber ?? 0,
            txHash: data.payload?.txHash ?? '',
            logIndex: data.payload?.logIndex ?? 0,
            eventName: data.topic,
            payload: data.payload ?? {},
            receivedAt: data.ts ?? Date.now(),
            timestamp: data.ts ?? Date.now(),
          };

          eventsRef.current.unshift(event);
          if (eventsRef.current.length > MAX_EVENTS) {
            eventsRef.current.length = MAX_EVENTS;
          }
          setEvents(eventsRef.current);
        } catch (err) {
          console.warn('[useEventStream] WS connect failed:', err);
          /* skip unparseable */
        }
      };

      ws.onerror = () => {
        ws.close();
        wsRef.current = null;
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        if (enabledRef.current) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), maxReconnectDelay);
          reconnectAttemptRef.current++;
          reconnectTimerRef.current = setTimeout(connect, delay);
        }
      };
    } catch (err) {
      setError(err instanceof Event ? err : new Event('connection failed'));
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

  return { events, isConnected, error };
}
