import type { AxiomEvent } from "../hooks/useEventHistory.js";

export function eventField<T>(event: AxiomEvent, key: string): T | undefined {
  const payload = event.payload as Record<string, unknown>;
  return payload[key] as T | undefined;
}

export function eventTokenId(event: AxiomEvent): string | null {
  const payload = event.payload as Record<string, unknown>;
  const tid = payload?.tokenId ?? payload?.agentTokenId ?? payload?._tokenId;
  return tid !== undefined && tid !== null ? String(tid) : null;
}
