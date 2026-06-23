// apps/backend/src/events/store.ts
//
// In-memory event store for agent lifecycle events received from the
// indexer (via POST /v1/events) and the orchestrator (via internal
// broadcasts). The store is bounded — at most MAX_EVENTS_PER_SOURCE
// events are retained per (source, eventName) pair; older events are
// evicted FIFO once the cap is reached.
//
// This is a "last 1000" ring per source/eventName. It is NOT a database;
// it is meant for the dashboard's "recent activity" panel and for
// short-horizon reconciliation between the indexer and the orchestrator.
// Persistence to 0G Storage or Postgres is a future wave (MW17+).
//
// Pure functions, no Express / no HTTP / no IO. The store is constructed
// once at server start and shared across requests via module-level
// singleton in server.ts.
//


/**
 * Default retention cap: 1000 events per (source, eventName) pair.
 * Matches the brief. Tune via the constructor argument when a different
 * cap is needed (tests, dev mode, etc.).
 */
export const DEFAULT_MAX_EVENTS_PER_SOURCE = 1000;

/**
 * Wire-format event as received from the indexer's HTTP sink or produced
 * by the orchestrator. `payload` is intentionally `unknown` — its shape
 * is event-specific (e.g. a Transfer event has {from,to,tokenId}; a
 * StrategyExecuted event has {agentTokenId, vaultBalance, ...}). The
 * store treats it as opaque JSON; callers filter / project as needed.
 */
export interface StoredEvent {
  /** Origin system, e.g. "indexer", "orchestrator". */
  source: string;
  /** EVM chain id the event was observed on (0G Galileo = 16602). */
  chainId: number;
  /** Block number the log was emitted in. */
  blockNumber: number;
  /** Transaction hash the log was emitted in. */
  txHash: string;
  /** Log index inside the transaction. */
  logIndex: number;
  /** Decoded event name (e.g. "Transfer", "StrategyExecuted"). */
  eventName: string;
  /** Opaque event-specific payload. */
  payload: Record<string, unknown>;
  /** Wall-clock ms when the store received it. */
  receivedAt: number;
}

/** Query filter for `queryByAgent` — all fields optional, ANDed together. */
export interface AgentEventQuery {
  /** Token id (decimal string or bigint). The store compares as string. */
  tokenId: string;
  /** Optional event name filter, e.g. "Transfer". */
  eventName?: string;
  /** Optional source filter, e.g. "indexer". */
  source?: string;
  /** Optional cap on results; default returns all matching. */
  limit?: number;
}

/**
 * The event store. One instance per server process. Public surface is
 * `append`, `queryByAgent`, `queryBySource`, `size`, and `clear`.
 */
export class EventStore {
  private readonly cap: number;
  /** Keyed by `${source}::${eventName}`. Insertion order is preserved (Map). */
  private readonly buckets: Map<string, StoredEvent[]>;
  /** Total appends since process start (post-eviction). */
  private total: number;

  constructor(maxEventsPerSource: number = DEFAULT_MAX_EVENTS_PER_SOURCE) {
    if (!Number.isInteger(maxEventsPerSource) || maxEventsPerSource <= 0) {
      throw new Error(
        `maxEventsPerSource must be a positive integer, got: ${maxEventsPerSource}`,
      );
    }
    this.cap = maxEventsPerSource;
    this.buckets = new Map();
    this.total = 0;
  }

  /**
   * Append a new event. Deep-clones via `structuredClone` so the caller's
   * object cannot be mutated post-append. Evicts the oldest event (FIFO)
   * when the bucket exceeds `cap`. Returns the cloned event stored.
   * Source: https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone
   */
  append(evt: StoredEvent): StoredEvent {
    const stored = structuredClone(evt) as StoredEvent;
    const key = `${stored.source}::${stored.eventName}`;
    let bucket = this.buckets.get(key);
    if (bucket === undefined) {
      bucket = [];
      this.buckets.set(key, bucket);
    }
    bucket.push(stored);
    if (bucket.length > this.cap) bucket.shift(); // Map order is preserved
    this.total += 1;
    return stored;
  }

  /**
   * Return all events matching the given (source, eventName) pair, oldest
   * first. The returned array is a deep clone so callers can sort / slice
   * without affecting the store.
   */
  queryBySource(source: string, eventName: string): StoredEvent[] {
    const bucket = this.buckets.get(`${source}::${eventName}`);
    if (bucket === undefined) return [];
    return structuredClone(bucket) as StoredEvent[];
  }

  /**
   * Return every event whose `payload` contains a `tokenId` field equal
   * to the query's `tokenId` (compared as decimal string). Iterates all
   * buckets; intended for the dashboard's per-agent history panel which
   * scans the full recent window. Cap with `query.limit` to bound cost.
   */
  queryByAgent(query: AgentEventQuery): StoredEvent[] {
    const target = BigInt(query.tokenId).toString();
    const matches: StoredEvent[] = [];
    for (const bucket of this.buckets.values()) {
      for (const evt of bucket) {
        const tid = tokenIdFromPayload(evt.payload);
        if (tid === null) continue;
        if (tid !== target) continue;
        if (query.eventName !== undefined && evt.eventName !== query.eventName) continue;
        if (query.source !== undefined && evt.source !== query.source) continue;
        matches.push(evt);
      }
    }
    // Stable order: by (blockNumber, logIndex) then receivedAt.
    matches.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
      if (a.logIndex !== b.logIndex) return a.logIndex - b.logIndex;
      return a.receivedAt - b.receivedAt;
    });
    const cloned = structuredClone(matches) as StoredEvent[];
    return query.limit !== undefined ? cloned.slice(0, query.limit) : cloned;
  }
  /**
   * Return every retained event across all buckets, oldest first. The
   * optional `limit` caps the result. The array is a deep clone.
   */
  getAll(limit?: number): StoredEvent[] {
    const all: StoredEvent[] = [];
    for (const bucket of this.buckets.values()) {
      all.push(...bucket);
    }
    all.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
      if (a.logIndex !== b.logIndex) return a.logIndex - b.logIndex;
      return a.receivedAt - b.receivedAt;
    });
    const cloned = structuredClone(all) as StoredEvent[];
    return limit !== undefined ? cloned.slice(0, limit) : cloned;
  }

  /**
   * Find all distinct token IDs associated with an owner address.
   * Iterates all events and collects unique tokenIds from Transfer
   * events where `to` matches the owner. Returns the most recent
   * blockNumber for each token. Best-effort — depends on event coverage.
   * Will be authoritative once a database is added.
   */
  getTokenIdsByOwner(owner: string, limit?: number): Array<{ tokenId: string; blockNumber: number }> {
    const seen = new Map<string, number>();
    for (const bucket of this.buckets.values()) {
      for (const evt of bucket) {
        if (evt.eventName !== "Transfer") continue;
        const payload = evt.payload;
        if (typeof payload.to !== "string") continue;
        if (payload.to.toLowerCase() !== owner.toLowerCase()) continue;
        const tid = tokenIdFromPayload(payload);
        if (tid === null) continue;
        if (!seen.has(tid) || evt.blockNumber > seen.get(tid)!) {
          seen.set(tid, evt.blockNumber);
        }
      }
    }
    const sorted = Array.from(seen.entries())
      .map(([tokenId, blockNumber]) => ({ tokenId, blockNumber }))
      .sort((a, b) => b.blockNumber - a.blockNumber);
    return limit !== undefined ? sorted.slice(0, limit) : sorted;
  }

  /** Number of buckets (one per source/eventName pair). */
  get bucketCount(): number {
    return this.buckets.size;
  }

  /** Total events currently retained across all buckets. */
  get size(): number {
    let n = 0;
    for (const bucket of this.buckets.values()) n += bucket.length;
    return n;
  }

  /** Total events appended since process start (pre-eviction count). */
  get totalAppends(): number {
    return this.total;
  }

  /** Drop all retained events. Useful for tests; not exposed via HTTP. */
  clear(): void {
    this.buckets.clear();
    this.total = 0;
  }
}

/**
 * Extract a `tokenId`-shaped field from an opaque event payload. Supports
 * `tokenId` (ERC-721), `agentTokenId` (vault / orchestrator), and
 * `_tokenId` (the underscored variant some ABI decoders emit). Returns
 * the value as a decimal string for comparison, or `null` if absent.
 */
function tokenIdFromPayload(payload: Record<string, unknown>): string | null {
  for (const key of ["tokenId", "agentTokenId", "_tokenId"] as const) {
    const raw = payload[key];
    if (raw === undefined || raw === null || raw === "") continue;
    if (typeof raw === "bigint") return raw.toString();
    if (typeof raw === "number" && Number.isFinite(raw)) return BigInt(raw).toString();
    if (typeof raw === "string") {
      try { return BigInt(raw).toString(); } catch { return null; }
    }
  }
  return null;
}

/**
 * Process-wide singleton, constructed lazily on first access. Tests
 * construct their own `EventStore` for isolation.
 */
let singleton: EventStore | undefined;
export function getEventStore(): EventStore {
  singleton ??= new EventStore();
  return singleton;
}
/** Test-only: reset the singleton. Not exported from server.ts. */
export function _resetEventStoreForTests(): void { singleton = undefined; }
