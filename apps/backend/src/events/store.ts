import { createLogger } from "../utils/logger.js";
import { DEFAULT_EVENT_LIMIT } from "../utils/constants.js";
import { extractErrorMessage } from "../utils/response.js";
import type { StoredEventPayload } from "./payloads.js";
import { loadBuckets, saveBuckets } from "./persist.js";

const log = createLogger("events");

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
  payload: StoredEventPayload;
  receivedAt: number;
  /** Monotonic timestamp (ms) set when the event is appended to the store. Used for cursor-based pull. */
  timestamp: number;
}

/** Input type for append() — receivedAt and timestamp are auto-filled if omitted. */
export type StoredEventInput = Omit<StoredEvent, "receivedAt" | "timestamp"> & {
  receivedAt?: number;
  timestamp?: number;
};

/** Query filter — all fields optional, ANDed together. */
export interface AgentEventQuery {
  tokenId: string;
  eventName?: string;
  source?: string;
  limit?: number;
}

interface IndexPositions {
  nameIdx: number;
  tokenIdx?: number;
}

const byBlockThenLogReceived = (a: StoredEvent, b: StoredEvent) =>
  a.blockNumber - b.blockNumber ||
  a.logIndex - b.logIndex ||
  a.receivedAt - b.receivedAt;

function dedupeKey(
  evt: Pick<StoredEventInput, "chainId" | "txHash" | "logIndex">,
): string {
  return `${evt.chainId}:${evt.txHash}:${evt.logIndex}`;
}

function isStoredEvent(val: unknown): val is StoredEvent {
  if (!val || typeof val !== "object") return false;
  const e = val as Record<string, unknown>;
  return (
    typeof e.source === "string" &&
    typeof e.chainId === "number" &&
    Number.isFinite(e.chainId) &&
    typeof e.blockNumber === "number" &&
    Number.isFinite(e.blockNumber) &&
    typeof e.txHash === "string" &&
    typeof e.logIndex === "number" &&
    Number.isFinite(e.logIndex) &&
    typeof e.eventName === "string" &&
    typeof e.payload === "object" &&
    e.payload !== null &&
    typeof e.receivedAt === "number" &&
    Number.isFinite(e.receivedAt) &&
    typeof e.timestamp === "number" &&
    Number.isFinite(e.timestamp)
  );
}

export class EventStore {
  private readonly cap: number;
  /** Keyed by `${source}::${eventName}`. Insertion order preserved. */
  private readonly buckets: Map<string, StoredEvent[]>;
  /** Index by eventName. */
  private readonly byEventName: Map<string, StoredEvent[]>;
  /** Index by tokenId (extracted from payload). */
  private readonly byTokenId: Map<string, StoredEvent[]>;
  /** Transfer index: owner lowercase → tokenId → latest blockNumber. */
  private readonly byTransferTo: Map<string, Map<string, number>>;
  /** O(1) index positions for swap-with-last removal. */
  private readonly indexPositions = new WeakMap<StoredEvent, IndexPositions>();
  /** Dedup keys for (chainId, txHash, logIndex). */
  private readonly seenKeys = new Set<string>();
  /** Total appends since process start. */
  private total: number;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private persistChain: Promise<void> = Promise.resolve();

  constructor(maxEventsPerSource: number = DEFAULT_EVENT_LIMIT) {
    if (!Number.isInteger(maxEventsPerSource) || maxEventsPerSource <= 0) {
      throw new Error(
        `maxEventsPerSource must be a positive integer, got: ${maxEventsPerSource}`,
      );
    }
    this.cap = maxEventsPerSource;
    this.buckets = new Map();
    this.byEventName = new Map();
    this.byTokenId = new Map();
    this.byTransferTo = new Map();
    this.total = 0;
    this.load();
  }

  /**
   * Append a new event. Shallow-clones top-level fields and payload keys so
   * callers cannot mutate stored data via their input object. Evicts oldest
   * (FIFO) when the bucket exceeds cap. Returns the stored copy.
   */
  append(evt: StoredEventInput): StoredEvent {
    const dedupe = dedupeKey(evt);
    const existing = this.findByDedupeKey(dedupe);
    if (existing) return existing;

    const stored: StoredEvent = {
      ...evt,
      payload: { ...evt.payload },
      receivedAt: evt.receivedAt ?? Date.now(),
      timestamp: Date.now(),
    };
    const bucketKey = `${stored.source}::${stored.eventName}`;
    let bucket = this.buckets.get(bucketKey);
    if (bucket === undefined) {
      bucket = [];
      this.buckets.set(bucketKey, bucket);
    }
    if (bucket.length >= this.cap) {
      const evicted = bucket.shift()!;
      this.seenKeys.delete(dedupeKey(evicted));
      this.removeFromIndex(evicted);
    }
    bucket.push(stored);
    this.seenKeys.add(dedupe);
    this.addToEventNameIndex(stored);
    const tid = tokenIdFromPayload(stored.payload);
    if (tid !== null) this.addToTokenIdIndex(tid, stored);
    this.updateTransferToIndex(stored);
    this.total += 1;
    this.persistDebounced();
    return stored;
  }

  queryBySource(source: string, eventName: string): readonly StoredEvent[] {
    const bucket = this.buckets.get(`${source}::${eventName}`);
    if (bucket === undefined) return [];
    return [...bucket];
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
      if (query.eventName !== undefined && evt.eventName !== query.eventName)
        continue;
      if (query.source !== undefined && evt.source !== query.source) continue;
      matches.push(evt);
    }
    // Stable order: by (blockNumber, logIndex) then receivedAt.
    matches.sort(byBlockThenLogReceived);
    return query.limit !== undefined ? matches.slice(0, query.limit) : matches;
  }
  getAll(
    limit?: number,
    since?: number,
    eventName?: string,
  ): readonly StoredEvent[] {
    if (eventName !== undefined) {
      const bucket = this.byEventName.get(eventName);
      if (!bucket) return [];
      if (!since) return [...bucket];
      return bucket.filter((e) => e.timestamp > since);
    }
    let all: StoredEvent[] = [];
    for (const bucket of this.buckets.values()) {
      all.push(...bucket);
    }
    let results = all;
    if (since !== undefined) {
      results = results.filter((e) => e.timestamp > since);
    }
    results.sort(byBlockThenLogReceived);
    return limit !== undefined ? results.slice(0, limit) : results;
  }

  /**
   * Find token IDs by owner address via the Transfer `to` index.
   * Best-effort — authoritative once a database is added.
   */
  getTokenIdsByOwner(
    owner: string,
    limit?: number,
  ): Array<{ tokenId: string; blockNumber: number }> {
    const ownerMap = this.byTransferTo.get(owner.toLowerCase());
    if (!ownerMap) return [];
    const sorted = Array.from(ownerMap.entries())
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
    const rawBuckets = loadBuckets();
    this.buckets.clear();
    this.byEventName.clear();
    this.byTokenId.clear();
    this.byTransferTo.clear();
    this.seenKeys.clear();
    this.total = 0;
    for (const [bucketKey, events] of rawBuckets) {
      const valid: StoredEvent[] = [];
      for (const evt of events) {
        if (!isStoredEvent(evt)) {
          log.warn("skipping invalid persisted event", { bucketKey });
          continue;
        }
        valid.push(evt);
      }
      if (valid.length === 0) continue;
      this.buckets.set(bucketKey, valid);
      this.total += valid.length;
      for (const evt of valid) {
        this.seenKeys.add(dedupeKey(evt));
        this.addToEventNameIndex(evt);
        const tid = tokenIdFromPayload(evt.payload);
        if (tid !== null) this.addToTokenIdIndex(tid, evt);
        this.updateTransferToIndex(evt);
      }
    }
  }

  private addToEventNameIndex(evt: StoredEvent): void {
    let bucket = this.byEventName.get(evt.eventName);
    if (!bucket) {
      bucket = [];
      this.byEventName.set(evt.eventName, bucket);
    }
    bucket.push(evt);
    const pos = this.indexPositions.get(evt) ?? { nameIdx: 0 };
    pos.nameIdx = bucket.length - 1;
    this.indexPositions.set(evt, pos);
  }

  private addToTokenIdIndex(tokenId: string, evt: StoredEvent): void {
    let bucket = this.byTokenId.get(tokenId);
    if (!bucket) {
      bucket = [];
      this.byTokenId.set(tokenId, bucket);
    }
    bucket.push(evt);
    const pos = this.indexPositions.get(evt) ?? { nameIdx: -1 };
    pos.tokenIdx = bucket.length - 1;
    this.indexPositions.set(evt, pos);
  }

  private removeFromIndexAt(
    bucket: StoredEvent[],
    idx: number,
    updatePos: (evt: StoredEvent, newIdx: number) => void,
  ): void {
    const last = bucket.length - 1;
    if (idx !== last) {
      const swapped = bucket[last]!;
      bucket[idx] = swapped;
      updatePos(swapped, idx);
    }
    bucket.pop();
  }

  private removeFromIndex(evt: StoredEvent): void {
    const pos = this.indexPositions.get(evt);

    const nameBucket = this.byEventName.get(evt.eventName);
    if (nameBucket && pos) {
      this.removeFromIndexAt(nameBucket, pos.nameIdx, (swapped, newIdx) => {
        const swappedPos = this.indexPositions.get(swapped);
        if (swappedPos) swappedPos.nameIdx = newIdx;
      });
      if (nameBucket.length === 0) this.byEventName.delete(evt.eventName);
    }

    const tid = tokenIdFromPayload(evt.payload);
    if (tid !== null && pos?.tokenIdx !== undefined) {
      const tidBucket = this.byTokenId.get(tid);
      if (tidBucket) {
        this.removeFromIndexAt(tidBucket, pos.tokenIdx, (swapped, newIdx) => {
          const swappedPos = this.indexPositions.get(swapped);
          if (swappedPos) swappedPos.tokenIdx = newIdx;
        });
        if (tidBucket.length === 0) this.byTokenId.delete(tid);
      }
    }

    this.removeFromTransferToIndex(evt);
  }

  private updateTransferToIndex(evt: StoredEvent): void {
    if (evt.eventName !== "Transfer") return;
    const payload = evt.payload;
    if (!("to" in payload) || typeof payload.to !== "string") return;
    const tid = tokenIdFromPayload(payload);
    if (tid === null) return;

    const owner = payload.to.toLowerCase();
    let ownerMap = this.byTransferTo.get(owner);
    if (!ownerMap) {
      ownerMap = new Map();
      this.byTransferTo.set(owner, ownerMap);
    }
    const existing = ownerMap.get(tid);
    if (existing === undefined || evt.blockNumber > existing) {
      ownerMap.set(tid, evt.blockNumber);
    }
  }

  private removeFromTransferToIndex(evt: StoredEvent): void {
    if (evt.eventName !== "Transfer") return;
    const payload = evt.payload;
    if (!("to" in payload) || typeof payload.to !== "string") return;
    const tid = tokenIdFromPayload(payload);
    if (tid === null) return;

    const owner = payload.to.toLowerCase();
    const ownerMap = this.byTransferTo.get(owner);
    if (!ownerMap || ownerMap.get(tid) !== evt.blockNumber) return;

    let max: number | undefined;
    const transferBucket = this.byEventName.get("Transfer");
    if (transferBucket) {
      for (const e of transferBucket) {
        if (e === evt) continue;
        if (!("to" in e.payload) || typeof e.payload.to !== "string") continue;
        if (e.payload.to.toLowerCase() !== owner) continue;
        const eTid = tokenIdFromPayload(e.payload);
        if (eTid !== tid) continue;
        if (max === undefined || e.blockNumber > max) max = e.blockNumber;
      }
    }

    if (max === undefined) {
      ownerMap.delete(tid);
      if (ownerMap.size === 0) this.byTransferTo.delete(owner);
    } else {
      ownerMap.set(tid, max);
    }
  }

  private enqueuePersist(): Promise<void> {
    this.persistChain = this.persistChain
      .then(() => saveBuckets(this.buckets))
      .catch((err) => {
        log.warn("persist failed", { error: extractErrorMessage(err) });
      });
    return this.persistChain;
  }

  /** Debounced (2s) variant — safe to call after every append. */
  private persistDebounced(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.enqueuePersist();
    }, 2_000);
  }

  /** Force-flush pending events to disk. Call before shutdown. */
  async flush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    await this.enqueuePersist();
  }

  clear(): void {
    this.buckets.clear();
    this.byEventName.clear();
    this.byTokenId.clear();
    this.byTransferTo.clear();
    this.seenKeys.clear();
    this.total = 0;
    void this.enqueuePersist();
  }

  private findByDedupeKey(key: string): StoredEvent | undefined {
    for (const bucket of this.buckets.values()) {
      const found = bucket.find((e) => dedupeKey(e) === key);
      if (found) return found;
    }
    return undefined;
  }
}

/**
 * Extract tokenId-shaped field from an opaque payload. Supports
 * tokenId, agentTokenId, _tokenId. Returns decimal string or null.
 */
function tokenIdFromPayload(payload: StoredEventPayload): string | null {
  const record = payload as Record<string, unknown>;
  for (const key of ["tokenId", "agentTokenId", "_tokenId"] as const) {
    const raw = record[key];
    if (raw === undefined || raw === null || raw === "") continue;
    if (typeof raw === "bigint") return raw.toString();
    if (typeof raw === "number" && Number.isFinite(raw))
      return BigInt(raw).toString();
    if (typeof raw === "string") {
      try {
        return BigInt(raw).toString();
      } catch {
        return null;
      }
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
export function _resetEventStoreForTests(): void {
  singleton = undefined;
}