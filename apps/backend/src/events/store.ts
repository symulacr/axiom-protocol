// In-memory event store for agent lifecycle events.


/** Default retention: 1000 events per (source, eventName) pair. */
export const DEFAULT_MAX_EVENTS_PER_SOURCE = 1000;

/**
 * Wire-format event from the indexer or orchestrator. payload is opaque to the store.
 */
export interface StoredEvent {
  source: string;
  chainId: number;
  blockNumber: number;
  txHash: string;
  logIndex: number;
  eventName: string;
  payload: Record<string, unknown>;
  receivedAt: number;
  /** Monotonic timestamp (ms) set when the event is appended to the store. Used for cursor-based pull. */
  timestamp: number;
}

/** Query filter — all fields optional, ANDed together. */
export interface AgentEventQuery {
  tokenId: string;
  eventName?: string;
  source?: string;
  limit?: number;
}

/** Shared sort comparator: by (blockNumber, logIndex, receivedAt). */
const byBlockThenLogReceived = (a: StoredEvent, b: StoredEvent) =>
  a.blockNumber - b.blockNumber || a.logIndex - b.logIndex || a.receivedAt - b.receivedAt;

/** In-memory event store. One per server process. */
export class EventStore {
  private readonly cap: number;
  /** Keyed by `${source}::${eventName}`. Insertion order preserved. */
  private readonly buckets: Map<string, StoredEvent[]>;
  /** Total appends since process start. */
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
   * Append a new event. Deep-clones via structuredClone. Evicts oldest (FIFO)
   * when the bucket exceeds cap. Returns the stored clone.
   */
  append(evt: StoredEvent): StoredEvent {
    const stored = structuredClone(evt) as StoredEvent;
    const key = `${stored.source}::${stored.eventName}`;
    let bucket = this.buckets.get(key);
    if (bucket === undefined) {
      bucket = [];
      this.buckets.set(key, bucket);
    }
    stored.timestamp = Date.now();
    bucket.push(stored);
    if (bucket.length > this.cap) bucket.shift(); // Map order is preserved
    this.total += 1;
    return stored;
  }

  /**
   * Return all events matching (source, eventName), oldest first.
   */
  queryBySource(source: string, eventName: string): readonly StoredEvent[] {
    const bucket = this.buckets.get(`${source}::${eventName}`);
    if (bucket === undefined) return [];
    return bucket;
  }

  /**
   * Return every event with matching tokenId in payload. Iterates all buckets.
   */
  queryByAgent(query: AgentEventQuery): readonly StoredEvent[] {
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
    matches.sort(byBlockThenLogReceived);
    return query.limit !== undefined ? matches.slice(0, query.limit) : matches;
  }
  /**
   * Return retained events across all buckets, oldest first.
   */
  getAll(limit?: number, since?: number): readonly StoredEvent[] {
    const all: StoredEvent[] = [];
    for (const bucket of this.buckets.values()) {
      all.push(...bucket);
    }
    let results = all;
    if (since !== undefined) {
      results = results.filter(e => e.timestamp > since);
    }
    results.sort(byBlockThenLogReceived);
    return limit !== undefined ? results.slice(0, limit) : results;
  }

  /**
   * Find token IDs by owner address. Scans Transfer events for matching `to`.
   * Best-effort — authoritative once a database is added.
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

  /** Number of buckets. */
  get bucketCount(): number {
    return this.buckets.size;
  }

  /** Total events currently retained. */
  get size(): number {
    let n = 0;
    for (const bucket of this.buckets.values()) n += bucket.length;
    return n;
  }

  /** Total events appended since process start. */
  get totalAppends(): number {
    return this.total;
  }

  /** Drop all retained events. For tests. */
  clear(): void {
    this.buckets.clear();
    this.total = 0;
  }
}

/**
 * Extract tokenId-shaped field from an opaque payload. Supports
 * tokenId, agentTokenId, _tokenId. Returns decimal string or null.
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

/** Lazy-initialized singleton. Tests construct their own. */
let singleton: EventStore | undefined;
export function getEventStore(): EventStore {
  singleton ??= new EventStore();
  return singleton;
}
/** Test-only: reset the singleton. Not exported from server.ts. */
export function _resetEventStoreForTests(): void { singleton = undefined; }
