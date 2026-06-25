import { useCallback, useMemo, useRef, useState } from 'react';
import { usePoll } from './usePoll.js';
import { apiFetch } from '../utils/apiFetch.js';

/** Wire-format event from GET /v1/events (mirrors backend `StoredEvent`). */
export interface AxiomEvent {
  source: string;
  chainId: number;
  blockNumber: number;
  txHash: string;
  logIndex: number;
  eventName: string;
  payload: Record<string, unknown>;
  receivedAt: number;
  timestamp: number;
}

interface EventsResponse {
  events: AxiomEvent[];
}

export interface UseEventHistoryResult {
  events: AxiomEvent[];
  byName: Record<string, AxiomEvent[]>;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export interface UseEventHistoryOptions {
  pollIntervalMs?: number;
  owner?: `0x${string}` | undefined;
  enabled?: boolean;
}

const DEFAULT_POLL_INTERVAL_MS = 15_000;

/** Group events by `eventName`, preserving first-occurrence order. */
function groupByName(events: readonly AxiomEvent[]): Record<string, AxiomEvent[]> {
  const out: Record<string, AxiomEvent[]> = {};
  for (const ev of events) {
    const bucket = out[ev.eventName];
    if (bucket !== undefined) {
      bucket.push(ev);
    } else {
      out[ev.eventName] = [ev];
    }
  }
  return out;
}

/**
 * Polled event history — fetches `GET /v1/events` on cadence. In-flight
 * requests are aborted on unmount or when key options change.
 */
const MAX_EVENTS = 500;

export function useEventHistory(
  options: UseEventHistoryOptions = {},
): UseEventHistoryResult {
  const { pollIntervalMs, owner, enabled = true } = options;
  const interval = pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  const [events, setEvents] = useState<AxiomEvent[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const lastTimestampRef = useRef<number>(0);

  const fetcher = useCallback(
    async (signal: AbortSignal): Promise<AxiomEvent[]> => {
      let path = `/v1/events?since=${lastTimestampRef.current}`;
      if (owner !== undefined) {
        path += `&owner=${owner}`;
      }
      const data = await apiFetch<EventsResponse>(path, {
        method: 'GET',
        signal,
        timeout: 10000,
      });
      const rawEvents = Array.isArray(data.events) ? data.events : [];
      const events = rawEvents.length > MAX_EVENTS ? rawEvents.slice(0, MAX_EVENTS) : rawEvents;

      // Update lastTimestamp from the newest event for incremental polling.
      // First poll gets ALL events; subsequent polls only get NEW events.
      if (events.length > 0) {
        const newestTimestamp = Math.max(...events.map(e => e.timestamp ?? 0));
        if (newestTimestamp > lastTimestampRef.current) {
          lastTimestampRef.current = newestTimestamp;
        }
      }

      return events;
    },
    [owner],
  );

  const { isLoading, refetch } = usePoll(fetcher, setEvents, setError, {
    intervalMs: interval,
    enabled,
  });

  const byName = useMemo<Record<string, AxiomEvent[]>>(
    () => groupByName(events),
    [events],
  );

  return { events, byName, isLoading, error, refetch };
}
