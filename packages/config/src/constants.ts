export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;

export const ZERO_DATA_ROOT = ("0x" + "0".repeat(64)) as `0x${string}`;

export function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

export const DEFAULT_EVENT_LIMIT = 500 as const;
export const MAX_EVENT_QUERY_LIMIT = 500 as const;

export const HTTP = {
  OK: 200,
  ACCEPTED: 202,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  UNPROCESSABLE: 422,
  TOO_MANY: 429,
  INTERNAL: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;

export const EVENT_NAMES = {
  Tick: "Tick",
  Transfer: "Transfer",
  Executed: "Executed",
  StrategySet: "StrategySet",
  Deposited: "Deposited",
  Withdrawn: "Withdrawn",
  Minted: "Minted",
  Unknown: "Unknown",
} as const;
export type EventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];
