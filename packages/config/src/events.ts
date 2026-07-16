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
