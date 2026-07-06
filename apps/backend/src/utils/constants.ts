/** Transfer event topic (keccak256 of Transfer(address,address,uint256)). */
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;

/** Maximum number of tokens to enumerate when scanning Transfer events. */
export const MAX_AGENT_ENUMERATION = 100 as const;

/** Maximum concurrent WebSocket clients. */
export const MAX_WS_CLIENTS = 1000 as const;

/** Default limit for event queries. */
export const DEFAULT_EVENT_LIMIT = 1000 as const;

/** Maximum limit for GET /v1/events queries. */
export const MAX_EVENT_QUERY_LIMIT = 500 as const;

/** Zero bytes32 root hash sentinel (no model data on storage). */
export const ZERO_DATA_ROOT = ("0x" + "0".repeat(64)) as `0x${string}`;
