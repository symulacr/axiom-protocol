export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;

export const ZERO_DATA_ROOT = ("0x" + "0".repeat(64)) as `0x${string}`;

export function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

// Single source of runtime tuning values; getRuntimeConfig() layers env overrides (INDEXER_POLL_WINDOW_BLOCKS=100) at startup; browser-safe when process.env is unavailable
export const RUNTIME_DEFAULTS = {
  indexerPollWindowBlocks: 500,
  indexerPollIntervalMs: 12_000,
  indexerReorgSafeDepth: 10n,
  wsMaxClients: 1000,
  wsHeartbeatIntervalMs: 30_000,
  wsMaxMissedPings: 3,
  oracleTimeoutMs: 10_000,
  orchestratorProviderTimeoutMs: 10_000,
  orchestratorEventScanBlocks: 2000,
  maxEventQueryLimit: 500,
  apiFetchTimeoutMs: 10_000,
  apiFetchLongTimeoutMs: 60_000,
  apiFetchStreamTimeoutMs: 120_000,
} as const;

export type RuntimeConfig = {
  [K in keyof typeof RUNTIME_DEFAULTS]: (typeof RUNTIME_DEFAULTS)[K];
};

const RUNTIME_ENV_VARS = {
  indexerPollWindowBlocks: "INDEXER_POLL_WINDOW_BLOCKS",
  indexerPollIntervalMs: "INDEXER_POLL_INTERVAL_MS",
  indexerReorgSafeDepth: "INDEXER_REORG_SAFE_DEPTH",
  wsMaxClients: "AXIOM_WS_MAX_CLIENTS",
  wsHeartbeatIntervalMs: "AXIOM_WS_HEARTBEAT_INTERVAL_MS",
  wsMaxMissedPings: "AXIOM_WS_MAX_MISSED_PINGS",
  oracleTimeoutMs: "AXIOM_ORACLE_TIMEOUT_MS",
  orchestratorProviderTimeoutMs: "AXIOM_ORCHESTRATOR_PROVIDER_TIMEOUT_MS",
  orchestratorEventScanBlocks: "AXIOM_ORCHESTRATOR_EVENT_SCAN_BLOCKS",
  maxEventQueryLimit: "AXIOM_MAX_EVENT_QUERY_LIMIT",
  apiFetchTimeoutMs: "AXIOM_API_FETCH_TIMEOUT_MS",
  apiFetchLongTimeoutMs: "AXIOM_API_FETCH_LONG_TIMEOUT_MS",
  apiFetchStreamTimeoutMs: "AXIOM_API_FETCH_STREAM_TIMEOUT_MS",
} as const;

type EnvLike = Record<string, string | undefined>;

function defaultRuntimeEnv(): EnvLike {
  // `typeof` guard keeps this safe in browser bundles (no node: imports).
  return typeof process !== "undefined" ? (process.env as EnvLike) : {};
}

// Memoized per env object (process.env identity is stable in Node) so per-tick calls reuse one config; overrides are read once at startup
const runtimeConfigCache = new WeakMap<object, RuntimeConfig>();

export function getRuntimeConfig(
  env: EnvLike = defaultRuntimeEnv(),
): RuntimeConfig {
  const cached = runtimeConfigCache.get(env);
  if (cached !== undefined) return cached;
  const out: Record<string, string | number | bigint> = {};
  for (const key of Object.keys(RUNTIME_DEFAULTS)) {
    const dflt = RUNTIME_DEFAULTS[key as keyof typeof RUNTIME_DEFAULTS];
    const envName = RUNTIME_ENV_VARS[key as keyof typeof RUNTIME_ENV_VARS];
    const raw = env[envName];
    if (raw === undefined) {
      out[key] = dflt;
    } else if (typeof dflt === "bigint") {
      out[key] = BigInt(raw);
    } else {
      out[key] = Number(raw);
    }
  }
  const config = out as unknown as RuntimeConfig;
  runtimeConfigCache.set(env, config);
  return config;
}

export const DEFAULT_EVENT_LIMIT = RUNTIME_DEFAULTS.maxEventQueryLimit;

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
  NOT_IMPLEMENTED: 501,
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
