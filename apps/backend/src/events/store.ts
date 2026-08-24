import { createLogger } from "../utils/logger.js";
import { DEFAULT_EVENT_LIMIT, bigintReplacer } from "@axiom/config";
import { extractErrorMessage } from "../utils/response.js";
import { broadcast } from "../ws/broadcaster.js";
import {
  openSync,
  writeFileSync,
  closeSync,
  unlinkSync,
  existsSync,
  readFileSync,
  mkdirSync,
} from "node:fs";
import { writeFile, rename, mkdir } from "node:fs/promises";
import {
  joinPath,
  dirnamePath,
  dataFilePath,
  backupFileBestEffort,
} from "@axiom/config/path";
interface TickPayload {
  tokenId: string;
  action: string;
  amount: number | null;
  reason: string;
  durationMs: number | null;
  executionSuccess: boolean | null;
  vaultBalance: string;
}

interface TransferPayload {
  tokenId: string;
  from: string;
  to: string;
}
interface DepositedPayload {
  tokenId: string;
  from: string;
  amount: string;
}
interface WithdrawnPayload {
  tokenId: string;
  to: string;
  amount: string;
}
interface StrategySetPayload {
  tokenId: string;
  strategyRoot: string;
  dailyLimit: string;
}
interface ExecutedPayload {
  tokenId: string;
  actionHash: string;
  target: string;
  value: string;
}
type EventPayload =
  | TickPayload
  | TransferPayload
  | DepositedPayload
  | WithdrawnPayload
  | StrategySetPayload
  | ExecutedPayload
  | Record<string, unknown>;

function hasPayloadKey(payload: unknown, key: string): boolean {
  return !!payload && typeof payload === "object" && key in payload;
}

export function payloadField(
  payload: unknown,
  key: string,
): string | undefined {
  return hasPayloadKey(payload, key)
    ? String((payload as Record<string, unknown>)[key])
    : undefined;
}

export function payloadNumber(
  payload: unknown,
  key: string,
): number | undefined {
  if (!hasPayloadKey(payload, key)) return undefined;
  const val = (payload as Record<string, unknown>)[key];
  if (val === undefined || val === null) return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

const log = createLogger("events");

interface StoredEvent {
  source: string;
  chainId: number;
  blockNumber: number;
  txHash: string | null;
  logIndex: number;
  eventName: string;
  payload: EventPayload;
  receivedAt: number;
  timestamp: number;
}

type StoredEventInput = Omit<StoredEvent, "receivedAt" | "timestamp"> & {
  receivedAt?: number;
  timestamp?: number;
};

interface AgentEventQuery {
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

/** Shared query tail: order by chain position, then apply the optional limit. */
function sortedLimited(
  list: StoredEvent[],
  limit?: number,
): readonly StoredEvent[] {
  list.sort(byBlockThenLogReceived);
  return limit !== undefined ? list.slice(0, limit) : list;
}

function dedupeKey(
  evt: Pick<StoredEventInput, "chainId" | "txHash" | "logIndex">,
): string {
  return `${evt.chainId}:${evt.txHash}:${evt.logIndex}`;
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  let v = map.get(key);
  if (v === undefined) {
    v = create();
    map.set(key, v);
  }
  return v;
}

function isNum(x: unknown): boolean {
  return typeof x === "number" && Number.isFinite(x);
}

function isStoredEvent(val: unknown): val is StoredEvent {
  if (!val || typeof val !== "object") return false;
  const e = val as Record<string, unknown>;
  return (
    typeof e.source === "string" &&
    isNum(e.chainId) &&
    isNum(e.blockNumber) &&
    (typeof e.txHash === "string" || e.txHash === null) &&
    isNum(e.logIndex) &&
    typeof e.eventName === "string" &&
    typeof e.payload === "object" &&
    e.payload !== null &&
    isNum(e.receivedAt) &&
    isNum(e.timestamp)
  );
}

export class EventStore {
  private readonly cap: number;
  private readonly buckets: Map<string, StoredEvent[]>;
  private readonly byEventName: Map<string, StoredEvent[]>;
  private readonly byTokenId: Map<string, StoredEvent[]>;
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
    const bucket = getOrCreate(this.buckets, bucketKey, () => []);
    if (bucket.length >= this.cap) {
      const evicted = bucket.shift(); // cap validated positive, so the bucket is non-empty here and shift cannot be undefined
      if (!evicted) throw new Error("EventStore cap bucket empty");
      this.seenKeys.delete(dedupeKey(evicted));
      this.removeFromIndex(evicted);
      if (this.total > 0) this.total -= 1;
    }
    bucket.push(stored);
    this.reindexEvent(stored, dedupe);
    this.dirty.add(bucketKey);
    this.total += 1;
    this.persistDebounced();
    try {
      broadcast(stored.eventName, stored);
    } catch {
      /* WS broadcast errors are non-fatal; a dead subscriber must not break ingestion */
    }
    return stored;
  }

  queryByAgent(query: AgentEventQuery): readonly StoredEvent[] {
    const target = BigInt(query.tokenId).toString();
    const bucket = this.byTokenId.get(target);
    if (bucket === undefined) return [];
    const matches = bucket.filter(
      (evt) =>
        (query.eventName === undefined || evt.eventName === query.eventName) &&
        (query.source === undefined || evt.source === query.source),
    );
    return sortedLimited(matches, query.limit);
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
    const results = [...this.allEvents()].filter(
      (e) => since === undefined || e.timestamp > since,
    );
    return sortedLimited(results, limit);
  }

  get size(): number {
    let n = 0;
    for (const bucket of this.buckets.values()) n += bucket.length;
    return n;
  }

  /** Flat iteration over every stored event, shared by getAll() and findByDedupeKey(). */
  private *allEvents(): Generator<StoredEvent> {
    for (const bucket of this.buckets.values()) yield* bucket;
  }

  /** Installs a validated/kept bucket and reindexes its events; load() and rollbackToBlock() share this so both rebuild indexes identically. */
  private installBucket(bucketKey: string, events: StoredEvent[]): void {
    this.buckets.set(bucketKey, events);
    this.total += events.length;
    for (const evt of events) {
      this.reindexEvent(evt);
    }
  }

  /** Single indexer shared by append(), load() and rollbackToBlock() so every insertion path keeps identical indexes; append() passes its precomputed dedupe key. */
  private reindexEvent(
    evt: StoredEvent,
    dedupe: string = dedupeKey(evt),
  ): void {
    this.seenKeys.add(dedupe);
    this.addToIndex(this.byEventName, evt.eventName, evt, "nameIdx", 0);
    const tid = tokenIdFromPayload(evt.payload);
    if (tid !== null) this.addToIndex(this.byTokenId, tid, evt, "tokenIdx", -1);
  }

  private load(): void {
    const rawBuckets = loadBuckets();
    this.resetState();
    for (const [bucketKey, events] of rawBuckets) {
      const valid = events.filter((evt): evt is StoredEvent => {
        if (isStoredEvent(evt)) return true;
        log.warn("skipping invalid persisted event", { bucketKey });
        return false;
      });
      if (valid.length > 0) this.installBucket(bucketKey, valid);
    }
  }

  /** Clears every index + counter; shared by load() and rollbackToBlock() before reinstalling kept buckets. */
  private resetState(): void {
    this.buckets.clear();
    this.byEventName.clear();
    this.byTokenId.clear();
    this.seenKeys.clear();
    this.total = 0;
  }

  private addToIndex(
    map: Map<string, StoredEvent[]>,
    key: string,
    evt: StoredEvent,
    field: "nameIdx" | "tokenIdx",
    defaultNameIdx: number,
  ): void {
    const bucket = getOrCreate(map, key, () => []);
    bucket.push(evt);
    const pos = this.indexPositions.get(evt) ?? { nameIdx: defaultNameIdx };
    pos[field] = bucket.length - 1;
    this.indexPositions.set(evt, pos);
  }

  private removeFromIndexAt(
    bucket: StoredEvent[],
    idx: number,
    updatePos: (evt: StoredEvent, newIdx: number) => void,
  ): void {
    const last = bucket.length - 1;
    if (idx !== last) {
      const swapped = bucket[last];
      if (!swapped) throw new Error("EventStore swap slot empty");
      bucket[idx] = swapped;
      updatePos(swapped, idx);
    }
    bucket.pop();
  }

  /** Swap-remove the event at `pos[field]` from one indexed bucket and drop the bucket when it empties. */
  private removeFromIndexedBucket(
    map: Map<string, StoredEvent[]>,
    key: string,
    pos: IndexPositions,
    field: "nameIdx" | "tokenIdx",
  ): void {
    const idx = pos[field];
    const bucket = map.get(key);
    if (bucket === undefined || idx === undefined) return;
    this.removeFromIndexAt(bucket, idx, (swapped, newIdx) => {
      const swappedPos = this.indexPositions.get(swapped);
      if (swappedPos) swappedPos[field] = newIdx;
    });
    if (bucket.length === 0) map.delete(key);
  }

  private removeFromIndex(evt: StoredEvent): void {
    const pos = this.indexPositions.get(evt);
    if (!pos) return;
    this.removeFromIndexedBucket(
      this.byEventName,
      evt.eventName,
      pos,
      "nameIdx",
    );
    const tid = tokenIdFromPayload(evt.payload);
    if (tid !== null) {
      this.removeFromIndexedBucket(this.byTokenId, tid, pos, "tokenIdx");
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
  rollbackToBlock(blockNumber: bigint): number {
    const cutoff = Number(blockNumber);
    if (!Number.isFinite(cutoff)) {
      log.warn("rollbackToBlock ignored — non-finite block number", {
        blockNumber: blockNumber.toString(),
      });
      return 0;
    }
    let removed = 0;
    const remaining = new Map<string, StoredEvent[]>();
    for (const [bucketKey, bucket] of this.buckets) {
      const kept = bucket.filter((evt) => {
        if (evt.blockNumber >= cutoff) {
          removed += 1;
          this.seenKeys.delete(dedupeKey(evt));
          return false;
        }
        return true;
      });
      if (kept.length > 0) {
        remaining.set(bucketKey, kept);
      } else {
        this.dirty.add(bucketKey);
      }
    }
    if (removed === 0) return 0;

    // indexPositions is a WeakMap: removed-event entries GC once dereferenced; kept events get positions overwritten below (mirrors load()).
    this.resetState();
    for (const [bucketKey, kept] of remaining) {
      this.installBucket(bucketKey, kept);
      this.dirty.add(bucketKey);
    }
    this.persistDebounced();
    // Surface rollback to WS subscribers (frontend listens on "*"); indexer console.warns server-side.
    broadcast("system.reorg", {
      cutoff,
      removed,
      remaining: this.total,
    });
    return removed;
  }

  private findByDedupeKey(key: string): StoredEvent | undefined {
    if (!this.seenKeys.has(key)) return undefined;
    for (const evt of this.allEvents()) {
      if (dedupeKey(evt) === key) return evt;
    }
    return undefined;
  }
}

function tokenIdFromPayload(payload: EventPayload): string | null {
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
  if (!singleton) {
    acquireEventStoreLock();
    singleton = new EventStore();
  }
  return singleton;
}

// Resolved at call time (not module load) so AXIOM_DATA_DIR set after import takes effect — matches acquireEventStoreLock and lets parallel test workers use per-file data dirs.
function persistPaths(): { dir: string; file: string } {
  const file = dataFilePath("events.json");
  return { dir: dirnamePath(file), file };
}

const persistLog = createLogger("events");

async function ensurePersistDir(): Promise<void> {
  await mkdir(persistPaths().dir, { recursive: true });
}

function loadBuckets(): Map<string, unknown[]> {
  try {
    const { file } = persistPaths();
    if (!existsSync(file)) return new Map();
    const raw = readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("persist file root is not an object");
    }
    const buckets = new Map<string, unknown[]>();
    for (const [bucketKey, events] of Object.entries(parsed)) {
      if (Array.isArray(events)) buckets.set(bucketKey, events);
    }
    return buckets;
  } catch (err) {
    persistLog.warn("persist file corrupt or unreadable, starting fresh", {
      error: extractErrorMessage(err),
    });
    backupFileBestEffort(persistPaths().file);
    return new Map();
  }
}

async function saveBuckets(
  buckets: Map<string, unknown[]>,
  serialized: Map<string, string>,
  dirty: Set<string>,
): Promise<void> {
  await ensurePersistDir();
  const parts: string[] = [];
  for (const [key, events] of buckets) {
    let json = serialized.get(key);
    if (dirty.has(key) || json === undefined) {
      json = JSON.stringify(events, bigintReplacer);
      serialized.set(key, json);
    }
    parts.push(`${JSON.stringify(key)}:${json}`);
  }
  dirty.clear();
  const data = `{${parts.join(",")}}`;
  const tmp = `${persistPaths().file}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, persistPaths().file);
}

/** Prevents silent multi-instance split-brain on one data dir; AXIOM_ALLOW_MULTI_INSTANCE escapes for externally-coordinated replicas only. */
const lockLog = createLogger("events-lock");

/** True when the lock file exists but its holder pid is provably dead
 *  (kill(pid,0) → ESRCH). A live-but-foreign holder still refuses. */
function stealStaleLock(lockPath: string): boolean {
  let raw = "";
  try {
    raw = readFileSync(lockPath, "utf-8").trim();
  } catch {
    return false;
  }
  const heldPid = Number.parseInt(raw.split("\n")[0] ?? "", 10);
  if (!Number.isInteger(heldPid) || heldPid <= 0 || heldPid === process.pid) {
    return false;
  }
  try {
    process.kill(heldPid, 0);
    return false; // alive — genuinely held
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ESRCH"; // nobody home
  }
}

export function acquireEventStoreLock(
  dataDir: string = process.env.AXIOM_DATA_DIR ?? process.cwd(),
): () => void {
  if (process.env.AXIOM_ALLOW_MULTI_INSTANCE === "true") {
    lockLog.warn(
      "AXIOM_ALLOW_MULTI_INSTANCE=true — EventStore file lock skipped (unsafe for JSON store)",
    );
    return () => {};
  }

  const lockPath = joinPath(dataDir, ".data", "event-store.lock");
  mkdirSync(joinPath(dataDir, ".data"), { recursive: true });

  // Lock file records holder pid + acquisition time; pid is what stealStaleLock liveness-checks.
  const writeLockFile = () => {
    const fd = openSync(lockPath, "wx");
    writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}\n`);
    closeSync(fd);
  };

  try {
    writeLockFile();
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EEXIST" && stealStaleLock(lockPath)) {
      // Crash/SIGKILL leaves the lock file behind; steal from a dead holder and retry exactly once.
      lockLog.warn("stale event-store lock from a dead pid — stealing it", {
        lockPath,
      });
      unlinkSync(lockPath);
      writeLockFile();
    } else if (code === "EEXIST") {
      let holder = "unknown";
      try {
        holder =
          readFileSync(lockPath, "utf-8").trim().split("\n")[0] ?? holder;
      } catch {
        /* ignore */
      }
      throw new Error(
        `EventStore lock held (pid ${holder}) at ${lockPath}. ` +
          `Refuse multi-instance on the same data dir. ` +
          `Stop the other process, delete the stale lock, or set AXIOM_ALLOW_MULTI_INSTANCE=true (unsafe).`,
        { cause: err },
      );
    } else {
      throw err;
    }
  }

  const release = () => {
    try {
      if (existsSync(lockPath)) unlinkSync(lockPath);
    } catch {
      /* best-effort */
    }
  };

  process.once("exit", release);
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, release);

  return release;
}
