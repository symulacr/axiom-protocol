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

export type EventPayload =
  | TickPayload
  | TransferPayload
  | DepositedPayload
  | WithdrawnPayload
  | StrategySetPayload
  | ExecutedPayload
  | Record<string, unknown>;

/** Wire-format payload stored on {@link StoredEvent}. */
export type StoredEventPayload = EventPayload;

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

function hasStringFields(
  o: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return keys.every((k) => typeof o[k] === "string");
}

/**
 * Basic shape check for known event payload kinds; any plain object is accepted
 * as an opaque {@link Record} fallback.
 */
export function isEventPayload(val: unknown): val is EventPayload {
  if (!isPlainObject(val)) return false;

  if (typeof val.tokenId === "string" && typeof val.action === "string") {
    return true;
  }
  if (hasStringFields(val, ["tokenId", "from", "to"])) return true;
  if (hasStringFields(val, ["tokenId", "from", "amount"])) return true;
  if (hasStringFields(val, ["tokenId", "to", "amount"])) return true;
  if (hasStringFields(val, ["tokenId", "strategyRoot", "dailyLimit"])) {
    return true;
  }
  if (hasStringFields(val, ["tokenId", "actionHash", "target", "value"])) {
    return true;
  }

  return true;
}

/** Safely extract a string field from an unknown payload. */
export function payloadField(
  payload: unknown,
  key: string,
): string | undefined {
  if (payload && typeof payload === "object" && key in payload) {
    return String((payload as Record<string, unknown>)[key]);
  }
  return undefined;
}

/** Safely extract a number field from an unknown payload. */
export function payloadNumber(
  payload: unknown,
  key: string,
): number | undefined {
  if (payload && typeof payload === "object" && key in payload) {
    const val = (payload as Record<string, unknown>)[key];
    if (val === undefined || val === null) return undefined;
    const n = Number(val);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}
