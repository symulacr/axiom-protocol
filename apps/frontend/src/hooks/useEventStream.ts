// Axiom Protocol — `useEventStream` hook.
//
// WebSocket event stream hook. Connects to the backend WS /v1/stream,
// subscribes to topic filters, and merges events into the same shape
// as useEventHistory. Falls back gracefully when WS is unavailable
// (the polling hook should be used alongside this one).

import { useCallback, useRef, useState } from 'react';
import { useMountEffect } from '../components/ui.js';
import { BACKEND_URL } from '../config/env.js';
import type { AxiomEvent } from './useEventHistory.js';

/** Public surface of the hook. */
export interface UseEventStreamResult {
  events: AxiomEvent[];
  isConnected: boolean;
  error: Event | null;
}

/** Options accepted by `useEventStream`. */
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
 *
 * The hook establishes a single WS connection on mount, forwards
 * incoming JSON messages into the standard `AxiomEvent` shape, and
 * tears down the connection on unmount. A `?topic=` query parameter
 * is appended for each entry in the `topics` array so the backend
 * can optionally server-side filter.
 *
 * Usage:
 *   const { events, isConnected } = useEventStream({
 *     topics: ['Transfer', 'PaymentProcessed'],
 *   });
 */
export function useEventStream(
  options: UseEventStreamOptions = {},
): UseEventStreamResult {
  const { topics = [], enabled = true } = options;
  const [events, setEvents] = useState<AxiomEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Event | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!enabled) return;

    // Build WS URL with topic params
    const scheme = BACKEND_URL.startsWith('https://') ? 'wss' : 'ws';
    const url = new URL(BACKEND_URL.replace(/^https?:\/\//, `${scheme}://`) + '/v1/stream');
    for (const t of topics) {
      url.searchParams.append('topic', t);
    }

    try {
      const ws = new WebSocket(url.toString());
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
      };

      ws.onmessage = (msg: MessageEvent) => {
        try {
          const data = JSON.parse(msg.data);
          if (data.topic === 'hello') return; // connection handshake

          // Convert WS message to AxiomEvent shape
          const event: AxiomEvent = {
            source: data.payload?.source ?? 'ws',
            chainId: data.payload?.chainId ?? 0,
            blockNumber: data.payload?.blockNumber ?? 0,
            txHash: data.payload?.txHash ?? '',
            logIndex: data.payload?.logIndex ?? 0,
            eventName: data.topic,
            payload: data.payload ?? {},
            receivedAt: data.ts ?? Date.now(),
          };

          setEvents(prev => {
            const next = [event, ...prev];
            return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
          });
        } catch {
          // Silently skip unparseable messages
        }
      };

      ws.onerror = (err: Event) => {
        setError(err);
        setIsConnected(false);
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
      };
    } catch (err) {
      setError(err instanceof Event ? err : new Event('connection failed'));
    }
  }, [enabled, topics.join(',')]);

  useMountEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  return { events, isConnected, error };
}
