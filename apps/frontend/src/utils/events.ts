import type { AxiomEvent } from '../hooks/useEventHistory.js';

/** Extract a typed field from an event payload. Returns undefined if missing. */
export function eventField<T>(event: AxiomEvent, key: string): T | undefined {
  const payload = event.payload as Record<string, unknown>;
  return payload[key] as T | undefined;
}

/** Extract tokenId from event payload. Returns string or null. */
export function eventTokenId(event: AxiomEvent): string | null {
  const payload = event.payload as Record<string, unknown>;
  const tid = payload?.tokenId ?? payload?.agentTokenId ?? payload?._tokenId;
  return tid !== undefined && tid !== null ? String(tid) : null;
}
