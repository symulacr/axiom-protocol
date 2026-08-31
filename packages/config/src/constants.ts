export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;

export const ZERO_DATA_ROOT = ("0x" + "0".repeat(64)) as `0x${string}`;

export function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

// Single source of runtime tuning values; getRuntimeConfig() layers env overrides (INDEXER_POLL_WINDOW_BLOCKS=100) at startup; browser-safe when process.env is unavailable
export const RUNTIME_DEFAULTS = {
  indexerPollWindowBlocks: 500,
  indexerPollIntervalMs: 3_000,
  indexerReorgSafeDepth: 10n,
  wsMaxClients: 1000,
  wsHeartbeatIntervalMs: 30_000,
  wsMaxMissedPings: 3,
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

/** Faucet kill-switch (V3 W6-B): env-driven so a testnet deploy can disable
 *  the drip without a code change. Defaults true (mock tokens, testnet only). */
export function isFaucetEnabled(
  env: Record<string, string | undefined> = defaultRuntimeEnv(),
): boolean {
  return env["AXIOM_FAUCET_ENABLED"] !== "false";
}

/** Relayer tuning values — resolved from env each call (no WeakMap caching here:
 *  callers pass test envs whose identity varies; the numbers are tiny to recompute). */
export const RELAYER_DEFAULTS = {
  intervalMs: 3_000,
  batchMax: 64,
  gasCapGwei: 2,
  logLookbackBlocks: 2_000,
  reconcileIntervalMs: 60_000,
  sponsorRatePerMin: 6,
  sponsorMaxGasCostWei: 1_000_000_000_000_000n,
  sponsorMaxInflightPerUser: 2,
  /** One-time axmUSDC faucet drip (base units, 6 decimals) — default 1000e6. */
  faucetAmountUsdc: 1_000_000_000n,
  /** Balance gate: an address holding ≥ 1 axmUSDC is not faucet-eligible. */
  faucetBalanceGate: 1_000_000n,
} as const;

const RELAYER_ENV_VARS = {
  intervalMs: "AXIOM_RELAYER_INTERVAL_MS",
  batchMax: "AXIOM_RELAYER_BATCH_MAX",
  gasCapGwei: "AXIOM_RELAYER_GAS_CAP_GWEI",
  logLookbackBlocks: "AXIOM_RELAYER_LOG_LOOKBACK_BLOCKS",
  reconcileIntervalMs: "AXIOM_RELAYER_RECONCILE_INTERVAL_MS",
  sponsorRatePerMin: "AXIOM_RELAYER_SPONSOR_RATE_PER_MIN",
  sponsorMaxGasCostWei: "AXIOM_RELAYER_SPONSOR_MAX_GAS_COST_WEI",
  sponsorMaxInflightPerUser: "AXIOM_RELAYER_SPONSOR_MAX_INFLIGHT_PER_USER",
  faucetAmountUsdc: "AXIOM_FAUCET_AMOUNT_USDC",
} as const;

export function getRelayerConfig(
  env: EnvLike = defaultRuntimeEnv(),
): RuntimeConfig & typeof RELAYER_DEFAULTS {
  const out: Record<string, string | number | bigint> = {
    ...RUNTIME_DEFAULTS,
  };
  for (const [key, dflt] of Object.entries(RELAYER_DEFAULTS)) {
    const envName = RELAYER_ENV_VARS[key as keyof typeof RELAYER_ENV_VARS];
    const raw = env[envName];
    if (raw === undefined) {
      out[key] = dflt;
    } else if (typeof dflt === "bigint") {
      out[key] = BigInt(raw);
    } else {
      out[key] = Number(raw);
    }
  }
  return out as RuntimeConfig & typeof RELAYER_DEFAULTS;
}

const RUNTIME_ENV_VARS = {
  indexerPollWindowBlocks: "INDEXER_POLL_WINDOW_BLOCKS",
  indexerPollIntervalMs: "INDEXER_POLL_INTERVAL_MS",
  indexerReorgSafeDepth: "INDEXER_REORG_SAFE_DEPTH",
  wsMaxClients: "AXIOM_WS_MAX_CLIENTS",
  wsHeartbeatIntervalMs: "AXIOM_WS_HEARTBEAT_INTERVAL_MS",
  wsMaxMissedPings: "AXIOM_WS_MAX_MISSED_PINGS",
  orchestratorProviderTimeoutMs: "AXIOM_ORCHESTRATOR_PROVIDER_TIMEOUT_MS",
  orchestratorEventScanBlocks: "AXIOM_ORCHESTRATOR_EVENT_SCAN_BLOCKS",
  maxEventQueryLimit: "AXIOM_MAX_EVENT_QUERY_LIMIT",
  apiFetchTimeoutMs: "AXIOM_API_FETCH_TIMEOUT_MS",
  apiFetchLongTimeoutMs: "AXIOM_API_FETCH_LONG_TIMEOUT_MS",
  apiFetchStreamTimeoutMs: "AXIOM_API_FETCH_STREAM_TIMEOUT_MS",
} as const;

type EnvLike = Record<string, string | undefined>;

function defaultRuntimeEnv(): EnvLike {
  // globalThis access keeps the guard safe in browser bundles (no node: imports, no ReferenceError).
  return globalThis.process !== undefined ? (process.env as EnvLike) : {};
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
  PAYMENT_REQUIRED: 402,
  CONFLICT: 409,
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
  Unknown: "Unknown",
} as const;
export type EventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];

/** Documented alias: EVENT_NAMES is the WS-broadcast subset of indexer events. */
export const BROADCAST_EVENT_NAMES = EVENT_NAMES;
