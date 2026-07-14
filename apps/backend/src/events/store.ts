import { createLogger } from "../utils/logger.js";
import { EVENT_NAMES } from "@axiom/config";
import { DEFAULT_EVENT_LIMIT } from "../utils/constants.js";
import { extractErrorMessage } from "../utils/response.js";
import type { StoredEventPayload } from "./payloads.js";
import { loadBuckets, saveBuckets } from "./persist.js";

const log = createLogger("events");

export interface StoredEvent {
  source: string;
  chainId: number;
  blockNumber: number;
  txHash: string | null;
  logIndex: number;
  eventName: string;
  payload: StoredEventPayload;
  receivedAt: number;
  timestamp: number;
}

export type StoredEventInput = Omit<StoredEvent, "receivedAt" | "timestamp"> & {
  receivedAt?: number;
  timestamp?: number;
};

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
    (typeof e.txHash === "string" || e.txHash === null) &&
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
  private readonly buckets: Map<string, StoredEvent[]>;
  private readonly byEventName: Map<string, StoredEvent[]>;
  private readonly byTokenId: Map<string, StoredEvent[]>;
  private readonly byTransferTo: Map<string, Map<string, number>>;
  private readonly indexPositions = new WeakMap<StoredEvent, IndexPositions>();
  private readonly seenKeys = new Set<string>();
  private readonly serialized = new Map<string, string>();
  private readonly dirty = new Set<string>();
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
    this.dirty.add(bucketKey);
    this.total += 1;
    this.persistDebounced();
    return stored;
  }

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
    const all: StoredEvent[] = [];
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

  get size(): number {
    let n = 0;
    for (const bucket of this.buckets.values()) n += bucket.length;
    return n;
  }

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
    if (evt.eventName !== EVENT_NAMES.Transfer) return;
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
    if (evt.eventName !== EVENT_NAMES.Transfer) return;
    const payload = evt.payload;
    if (!("to" in payload) || typeof payload.to !== "string") return;
    const tid = tokenIdFromPayload(payload);
    if (tid === null) return;

    const owner = payload.to.toLowerCase();
    const ownerMap = this.byTransferTo.get(owner);
    if (!ownerMap || ownerMap.get(tid) !== evt.blockNumber) return;

    let max: number | undefined;
    const transferBucket = this.byEventName.get(EVENT_NAMES.Transfer);
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
      .then(() => saveBuckets(this.buckets, this.serialized, this.dirty))
      .catch((err) => {
        log.warn("persist failed", { error: extractErrorMessage(err) });
      });
    return this.persistChain;
  }

  private persistDebounced(): void {
    if (this.dirty.size === 0) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.enqueuePersist();
    }, 2_000);
  }

  async flush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    for (const key of this.buckets.keys()) this.dirty.add(key);
    await this.enqueuePersist();
  }

  private findByDedupeKey(key: string): StoredEvent | undefined {
    for (const bucket of this.buckets.values()) {
      const found = bucket.find((e) => dedupeKey(e) === key);
      if (found) return found;
    }
    return undefined;
  }
}

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

let singleton: EventStore | undefined;
export function getEventStore(): EventStore {
  singleton ??= new EventStore();
  return singleton;
}