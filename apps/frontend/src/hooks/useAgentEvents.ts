import { useEffect, useMemo, useRef } from "react";
import {
  useEventHistory,
  eventTokenId,
  eventDedupeKey,
  sortEventsChronological,
  type AxiomEvent,
} from "./useEventHistory.js";
import { useEventStream } from "./useEventStream.js";

interface UseAgentEventsOptions {
  enabled?: boolean;
}

interface UseAgentEventsResult {
  events: AxiomEvent[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useAgentEvents(
  tokenId: bigint | null,
  options: UseAgentEventsOptions = {},
): UseAgentEventsResult {
  const { enabled = true } = options;
  const { events, isLoading, error, refetch } = useEventHistory({
    pollIntervalMs: 15_000,
    enabled,
  });
  const { events: wsEvents, isConnected } = useEventStream({
    topics: ["*"],
    enabled,
  });

  const hadWsConnectRef = useRef(false);
  useEffect(() => {
    if (!enabled) {
      hadWsConnectRef.current = false;
      return;
    }
    if (!isConnected || hadWsConnectRef.current) return;
    hadWsConnectRef.current = true;
    refetch();
  }, [enabled, isConnected, refetch]);

  const agentEvents = useMemo(() => {
    if (!enabled || tokenId === null) return [];

    const tid = tokenId.toString();
    const matches = (ev: AxiomEvent) => eventTokenId(ev) === tid;

    const httpFiltered = events.filter(matches);
    const wsFiltered = wsEvents.filter(matches);

    const seen = new Set(httpFiltered.map(eventDedupeKey));
    const merged = [...httpFiltered];
    for (const ev of wsFiltered) {
      const key = eventDedupeKey(ev);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(ev);
      }
    }
    merged.sort(sortEventsChronological);
    return merged;
  }, [enabled, events, wsEvents, tokenId]);

  return useMemo(
    () => ({
      events: agentEvents,
      isLoading,
      error,
      refetch,
    }),
    [agentEvents, isLoading, error, refetch],
  );
}
