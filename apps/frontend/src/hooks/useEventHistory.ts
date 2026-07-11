import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAccount } from "wagmi";
import { usePolledApi } from "./usePolledApi.js";
export function eventTokenId(event: AxiomEvent): string | null {
  const payload = event.payload as Record<string, unknown>;
  const tid = payload?.tokenId ?? payload?.agentTokenId ?? payload?._tokenId;
  return tid !== undefined && tid !== null ? String(tid) : null;
}

export function eventDedupeKey(ev: AxiomEvent): string {
  return `${ev.chainId}:${ev.txHash}:${ev.logIndex}`;
}

export function sortEventsChronological(
  a: AxiomEvent,
  b: AxiomEvent,
): number {
  return (
    a.blockNumber - b.blockNumber ||
    a.logIndex - b.logIndex ||
    a.receivedAt - b.receivedAt
  );
}


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


export function useEventHistory(
  options: UseEventHistoryOptions = {},
): UseEventHistoryResult {
  const { pollIntervalMs, owner, enabled = true } = options;
  const { isConnected } = useAccount();
  const interval = pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  
  
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
    enabled: enabled && isConnected,
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
