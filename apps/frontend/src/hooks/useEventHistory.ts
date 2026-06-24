import { useEffect, useMemo, useState } from 'react';
import { BACKEND_URL } from '../config/env.js';

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
}

interface EventsResponse {
  events: AxiomEvent[];
}

export interface UseEventHistoryResult {
  events: AxiomEvent[];
  byName: Record<string, AxiomEvent[]>;
  isLoading: boolean;
  error: Error | null;
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
export function useEventHistory(
  options: UseEventHistoryOptions = {},
): UseEventHistoryResult {
  const { pollIntervalMs, owner, enabled = true } = options;
  const interval = pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  const [events, setEvents] = useState<AxiomEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const fetchOnce = async (): Promise<void> => {
      try {
        const url = new URL(`${BACKEND_URL}/v1/events`);
        if (owner !== undefined) {
          url.searchParams.set('owner', owner);
        }
        const res = await fetch(url.toString(), {
          method: 'GET',
          headers: { accept: 'application/json' },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(
            `events fetch failed: ${res.status} ${res.statusText}${body.length > 0 ? ` ${body}` : ''}`,
          );
        }
        const data = (await res.json()) as EventsResponse;
        if (cancelled) {
          return;
        }
        setEvents(Array.isArray(data.events) ? data.events : []);
        setError(null);
      } catch (err) {
        if (cancelled) {
          return;
        }
        // AbortError on unmount — ignore.
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        const wrapped = err instanceof Error ? err : new Error(String(err));
        setError(wrapped);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void fetchOnce();
    timer = setTimeout(function tick() {
      void fetchOnce();
      timer = setTimeout(tick, interval);
    }, interval);

    return (): void => {
      cancelled = true;
      controller.abort();
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [owner, enabled, interval]);

  const byName = useMemo<Record<string, AxiomEvent[]>>(
    () => groupByName(events),
    [events],
  );

  return { events, byName, isLoading, error };
}
