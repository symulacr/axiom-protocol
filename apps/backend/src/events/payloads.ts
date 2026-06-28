/** Typed event payload interfaces. Eliminates `as Record<string, unknown>` casts. */

export interface TickPayload {
  tokenId: string;
  action: string;
  amount: number | null;
  reason: string;
  durationMs: number | null;
  executionSuccess: boolean | null;
  vaultBalance: string;
}

export interface TransferPayload {
  tokenId: string;
  from: string;
  to: string;
}

export interface DepositedPayload {
  tokenId: string;
  from: string;
  amount: string;
}

export interface WithdrawnPayload {
  tokenId: string;
  to: string;
  amount: string;
}

export interface StrategySetPayload {
  tokenId: string;
  strategyRoot: string;
  dailyLimit: string;
}

export interface ExecutedPayload {
  tokenId: string;
  actionHash: string;
  target: string;
  value: string;
}

export type EventPayload = TickPayload | TransferPayload | DepositedPayload | WithdrawnPayload | StrategySetPayload | ExecutedPayload | Record<string, unknown>;

/** Safely extract a string field from an unknown payload. */
export function payloadField(payload: unknown, key: string): string | undefined {
  if (payload && typeof payload === 'object' && key in payload) {
    return String((payload as Record<string, unknown>)[key]);
  }
  return undefined;
}

/** Safely extract a number field from an unknown payload. */
export function payloadNumber(payload: unknown, key: string): number | undefined {
  if (payload && typeof payload === 'object' && key in payload) {
    const val = (payload as Record<string, unknown>)[key];
    return val !== undefined && val !== null ? Number(val) : undefined;
  }
  return undefined;
}
