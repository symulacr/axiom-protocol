import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePolledApi } from "./usePolledApi.js";

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
const MAX_EVENTS = 500;

function eventDedupeKey(ev: AxiomEvent): string {
  return `${ev.chainId}:${ev.txHash}:${ev.logIndex}`;
}

function sortEventsChronological(a: AxiomEvent, b: AxiomEvent): number {
  return (
    a.blockNumber - b.blockNumber ||
    a.logIndex - b.logIndex ||
    a.receivedAt - b.receivedAt
  );
}

function groupByName(
  events: readonly AxiomEvent[],
): Record<string, AxiomEvent[]> {
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
 *
 * Uses cursor-based incremental polling: only events *after* the most-recent
 * known timestamp are fetched on subsequent polls.
 */
export function useEventHistory(
  options: UseEventHistoryOptions = {},
): UseEventHistoryResult {
  const { pollIntervalMs, owner, enabled = true } = options;
  const interval = pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  // Ref (not state) — updates after each successful fetch without
  // causing a re-render or query-key change that would flicker data.
  const lastTimestampRef = useRef(0);
  const mergedEventsRef = useRef<AxiomEvent[]>([]);

  const urlGetter = useCallback(() => {
    let path = `/v1/events?since=${lastTimestampRef.current}`;
    if (owner !== undefined) {
      path += `&owner=${owner}`;
    }
    return path;
  }, [owner]);

  const query = usePolledApi<EventsResponse>(urlGetter, {
    refetchInterval: interval,
    enabled,
    queryKey: ["events", { owner }],
  });

  useEffect(() => {
    mergedEventsRef.current = [];
    lastTimestampRef.current = 0;
  }, [owner, enabled]);

  useEffect(() => {
    if (!query.data) return;
    const raw = Array.isArray(query.data.events) ? query.data.events : [];
    if (raw.length > 0) {
      const maxTs = Math.max(...raw.map((e) => e.timestamp ?? 0));
      if (maxTs > lastTimestampRef.current) {
        lastTimestampRef.current = maxTs;
      }
    }
  }, [query.data]);

  const events = useMemo(() => {
    if (!query.data?.events) return mergedEventsRef.current;

    const raw = Array.isArray(query.data.events) ? query.data.events : [];
    if (raw.length === 0) return mergedEventsRef.current;

    const seen = new Set(mergedEventsRef.current.map(eventDedupeKey));
    const merged = [...mergedEventsRef.current];
    for (const ev of raw) {
      const key = eventDedupeKey(ev);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(ev);
      }
    }

    merged.sort(sortEventsChronological);
    const capped =
      merged.length > MAX_EVENTS ? merged.slice(-MAX_EVENTS) : merged;
    mergedEventsRef.current = capped;
    return capped;
  }, [query.data]);

  const byName = useMemo<Record<string, AxiomEvent[]>>(
    () => groupByName(events),
    [events],
  );

  return {
    events,
    byName,
    isLoading: query.isFetching,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}
