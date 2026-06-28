import { useEffect, useMemo } from 'react';
import { useEventHistory, type AxiomEvent } from './useEventHistory.js';
import { useEventStream } from './useEventStream.js';

export interface UseAgentEventsResult {
  events: AxiomEvent[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Filters useEventHistory events by tokenId. Shared by AgentDetail
 * (Activity tab) and the Performance tab. Keeps the timeline fresh
 * via WebSocket events.
 */
export function useAgentEvents(tokenId: bigint | null): UseAgentEventsResult {
  const { events, isLoading, error, refetch } = useEventHistory({ pollIntervalMs: 15_000 });
  const { events: wsEvents } = useEventStream({ topics: ['*'] });

  // Debounced refetch on WS event
  useEffect(() => {
    if (wsEvents.length === 0) return;
    const t = setTimeout(refetch, 200);
    return () => clearTimeout(t);
  }, [wsEvents, refetch]);

  const agentEvents = useMemo(
    () => tokenId === null
      ? []
      : events.filter(ev => String((ev.payload as Record<string, unknown>)?.tokenId) === tokenId.toString()),
    [events, tokenId],
  );

  return { events: agentEvents, isLoading, error, refetch };
}
