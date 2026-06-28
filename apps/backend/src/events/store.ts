import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from '../utils/logger.js';

const log = createLogger("events");



/** Default retention: 1000 events per (source, eventName) pair. */
export const DEFAULT_MAX_EVENTS_PER_SOURCE = 1000;

const PERSIST_DIR = join(process.cwd(), '.data');
const PERSIST_FILE = join(PERSIST_DIR, 'events.json');

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

const byBlockThenLogReceived = (a: StoredEvent, b: StoredEvent) =>
  a.blockNumber - b.blockNumber || a.logIndex - b.logIndex || a.receivedAt - b.receivedAt;

export class EventStore {
  private readonly cap: number;
  /** Keyed by `${source}::${eventName}`. Insertion order preserved. */
  private readonly buckets: Map<string, StoredEvent[]>;
  /** Index by eventName. */
  private readonly byEventName: Map<string, StoredEvent[]>;
  /** Index by tokenId (extracted from payload). */
  private readonly byTokenId: Map<string, StoredEvent[]>;
  /** Total appends since process start. */
  private total: number;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(maxEventsPerSource: number = DEFAULT_MAX_EVENTS_PER_SOURCE) {
    if (!Number.isInteger(maxEventsPerSource) || maxEventsPerSource <= 0) {
      throw new Error(
        `maxEventsPerSource must be a positive integer, got: ${maxEventsPerSource}`,
      );
    }
    this.cap = maxEventsPerSource;
    this.buckets = new Map();
    this.byEventName = new Map();
    this.byTokenId = new Map();
    this.total = 0;
    this.load();
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
    if (bucket.length >= this.cap) {
      const evicted = bucket.shift()!;
      this.removeFromIndex(evicted);
    }
    bucket.push(stored);
    this.addToEventNameIndex(stored);
    const tid = tokenIdFromPayload(stored.payload);
    if (tid !== null) this.addToTokenIdIndex(tid, stored);
    this.total += 1;
    this.persistDebounced();
    return stored;
  }

  queryBySource(source: string, eventName: string): readonly StoredEvent[] {
    const bucket = this.buckets.get(`${source}::${eventName}`);
    if (bucket === undefined) return [];
    return bucket;
  }

  /**
   * Return every event with matching tokenId in payload. Uses the byTokenId index.
   */
  queryByAgent(query: AgentEventQuery): readonly StoredEvent[] {
    const target = BigInt(query.tokenId).toString();
    const bucket = this.byTokenId.get(target);
    if (bucket === undefined) return [];
    const matches: StoredEvent[] = [];
    for (const evt of bucket) {
      if (query.eventName !== undefined && evt.eventName !== query.eventName) continue;
      if (query.source !== undefined && evt.source !== query.source) continue;
      matches.push(evt);
    }
    // Stable order: by (blockNumber, logIndex) then receivedAt.
    matches.sort(byBlockThenLogReceived);
    return query.limit !== undefined ? matches.slice(0, query.limit) : matches;
  }
  getAll(limit?: number, since?: number, eventName?: string): readonly StoredEvent[] {
    if (eventName !== undefined) {
      const bucket = this.byEventName.get(eventName);
      if (!bucket) return [];
      if (!since) return bucket;
      return bucket.filter(e => e.timestamp > since);
    }
    let all: StoredEvent[] = [];
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

  get bucketCount(): number {
    return this.buckets.size;
  }

  get size(): number {
    let n = 0;
    for (const bucket of this.buckets.values()) n += bucket.length;
    return n;
  }

  get totalAppends(): number {
    return this.total;
  }

  /**
   * Load persisted events from disk. Silently no-ops if the file doesn't exist
   * or is corrupt — data loss is acceptable for this in-memory store.
   */
  private load(): void {
    try {
      if (!existsSync(PERSIST_FILE)) return;
      const raw = readFileSync(PERSIST_FILE, 'utf-8');
      const data = JSON.parse(raw) as Record<string, StoredEvent[]>;
      this.buckets.clear();
      this.byEventName.clear();
      this.byTokenId.clear();
      for (const [key, events] of Object.entries(data)) {
        this.buckets.set(key, events);
        this.total += events.length;
        for (const evt of events) {
          this.addToEventNameIndex(evt);
          const tid = tokenIdFromPayload(evt.payload);
          if (tid !== null) this.addToTokenIdIndex(tid, evt);
        }
      }
    } catch {
      // File missing or corrupt — start fresh.
    }
  }

  private addToEventNameIndex(evt: StoredEvent): void {
    let bucket = this.byEventName.get(evt.eventName);
    if (!bucket) {
      bucket = [];
      this.byEventName.set(evt.eventName, bucket);
    }
    bucket.push(evt);
  }

  private addToTokenIdIndex(tokenId: string, evt: StoredEvent): void {
    let bucket = this.byTokenId.get(tokenId);
    if (!bucket) {
      bucket = [];
      this.byTokenId.set(tokenId, bucket);
    }
    bucket.push(evt);
  }

  private removeFromIndex(evt: StoredEvent): void {
    const nameBucket = this.byEventName.get(evt.eventName);
    if (nameBucket) {
      const idx = nameBucket.indexOf(evt);
      if (idx !== -1) nameBucket.splice(idx, 1);
    }
    const tid = tokenIdFromPayload(evt.payload);
    if (tid !== null) {
      const tidBucket = this.byTokenId.get(tid);
      if (tidBucket) {
        const idx = tidBucket.indexOf(evt);
        if (idx !== -1) tidBucket.splice(idx, 1);
      }
    }
  }

  private persist(): void {
    try {
      if (!existsSync(PERSIST_DIR)) mkdirSync(PERSIST_DIR, { recursive: true });
      const data = Object.fromEntries(this.buckets);
      writeFileSync(PERSIST_FILE, JSON.stringify(data, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value,
      ));
    } catch (err) {
      log.warn("persist failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  /** Debounced (2s) variant — safe to call after every append. */
  private persistDebounced(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.persist(), 2_000);
  }

  /** Force-flush pending events to disk. Call before shutdown. */
  flush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.persist();
  }

  clear(): void {
    this.buckets.clear();
    this.byEventName.clear();
    this.byTokenId.clear();
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
