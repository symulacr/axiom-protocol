export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;

export const MAX_AGENT_ENUMERATION = 100 as const;

export const MAX_WS_CLIENTS = 1000 as const;

export const DEFAULT_EVENT_LIMIT = 1000 as const;

export const MAX_EVENT_QUERY_LIMIT = 500 as const;

export const ZERO_DATA_ROOT = ("0x" + "0".repeat(64)) as `0x${string}`;
