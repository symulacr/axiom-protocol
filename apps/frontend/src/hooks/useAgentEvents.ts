import { useEffect, useMemo, useRef } from "react";
import { useEventHistory, type AxiomEvent } from "./useEventHistory.js";
import { useEventStream } from "./useEventStream.js";
import { eventTokenId } from "../utils/events.js";

export interface UseAgentEventsOptions {
  enabled?: boolean;
}

export interface UseAgentEventsResult {
  events: AxiomEvent[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

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

/**
 * Filters useEventHistory events by tokenId. Shared by AgentDetail
 * (Activity tab) and the Performance tab. Keeps the timeline fresh
 * via WebSocket events.
 */
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

  const result = useMemo(
    () => ({
      events: agentEvents,
      isLoading,
      error,
      refetch,
    }),
    [agentEvents, isLoading, error, refetch],
  );

  return result;
}