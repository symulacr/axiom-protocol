import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAccount } from "wagmi";
import { usePolledApi } from "./usePolledApi.js";
import type { Hex } from "viem";

export interface AxiomEvent {
  blockNumber: number;
  logIndex: number;
  txHash: Hex;
  chainId: number;
  receivedAt: number;
  transactionHash?: Hex;
  eventName: string;
  payload?: Record<string, unknown>;
  source?: string;
  timestamp?: number;
}

export function eventTokenId(event: AxiomEvent): string | null {
  const payload = event.payload as Record<string, unknown>;
  const tid = payload?.tokenId ?? payload?.agentTokenId ?? payload?._tokenId;
  return tid !== undefined && tid !== null ? String(tid) : null;
}

export function eventDedupeKey(ev: AxiomEvent): string {
  return `${ev.chainId}:${ev.txHash}:${ev.logIndex}`;
}

/** Ownership scope shared by every event consumer (Transactions, Dashboard,
 * Chat): an event is the user's when it touches one of their agent token
 * ids or their address appears in the payload. The indexer subscribes with
 * `topics:["*"]`, so consumers MUST filter through this single predicate —
 * raw `events.filter(e => e.eventName !== "transcript")` renders the whole
 * chain's activity as if it were the user's. */
export function isOwnEvent(
  ev: AxiomEvent,
  scope: { address?: string; tokenIds: Set<string> },
): boolean {
  const tokenId = eventTokenId(ev);
  if (tokenId !== null && scope.tokenIds.has(tokenId)) return true;
  const owner = scope.address?.toLowerCase();
  if (!owner) return false;
  const payload = ev.payload ?? {};
  return [payload.from, payload.to, payload.owner].some(
    (field) => typeof field === "string" && field.toLowerCase() === owner,
  );
}

function sortEventsChronological(a: AxiomEvent, b: AxiomEvent): number {
  return (
    a.blockNumber - b.blockNumber ||
    a.logIndex - b.logIndex ||
    a.receivedAt - b.receivedAt
  );
}

/** Merge a secondary event source (WS frames, poll pages) into a base list,
 * dropping duplicates by chainId:txHash:logIndex, chronological order. */
export function mergeDedupedEvents(
  base: AxiomEvent[],
  incoming: AxiomEvent[],
): AxiomEvent[] {
  const seen = new Set(base.map(eventDedupeKey));
  const merged = [...base];
  for (const ev of incoming) {
    const key = eventDedupeKey(ev);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(ev);
    }
  }
  merged.sort(sortEventsChronological);
  return merged;
}

interface EventsResponse {
  events: AxiomEvent[];
}

interface UseEventHistoryResult {
  events: AxiomEvent[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

interface UseEventHistoryOptions {
  pollIntervalMs?: number;
  enabled?: boolean;
}

const DEFAULT_POLL_INTERVAL_MS = 15_000;
/** Event-list cap shared with the WS stream (useEventStream) so both sources can never grow unbounded. */
export const MAX_EVENTS = 500;

export function useEventHistory(
  options: UseEventHistoryOptions = {},
): UseEventHistoryResult {
  const { pollIntervalMs, enabled = true } = options;
  const { isConnected } = useAccount();
  const interval = pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  const lastTimestampRef = useRef(0);
  const mergedEventsRef = useRef<AxiomEvent[]>([]);

  const urlGetter = useCallback(
    () => `/v1/events?since=${lastTimestampRef.current}`,
    [],
  );

  const query = usePolledApi<EventsResponse>(urlGetter, {
    refetchInterval: interval,
    enabled: enabled && isConnected,
    queryKey: ["events"],
  });

  useEffect(() => {
    mergedEventsRef.current = [];
    lastTimestampRef.current = 0;
  }, [enabled]);

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

    const capped = mergeDedupedEvents(mergedEventsRef.current, raw).slice(
      -MAX_EVENTS,
    );
    mergedEventsRef.current = capped;
    return capped;
  }, [query.data]);

  return {
    events,
    isLoading: query.isFetching,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}
