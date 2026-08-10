import { createLogger } from "../utils/logger.js";
import {
	EVENT_NAMES,
	DEFAULT_EVENT_LIMIT,
	bigintReplacer,
} from "@axiom/config";
import { extractErrorMessage } from "../utils/response.js";
import type { StoredEventPayload } from "./payloads.js";
import { broadcast } from "../ws/broadcaster.js";
import {
	openSync,
	writeFileSync,
	closeSync,
	unlinkSync,
	existsSync,
	readFileSync,
	renameSync,
	mkdirSync,
} from "node:fs";
import { writeFile, rename, mkdir } from "node:fs/promises";
import { join } from "node:path";

const log = createLogger("events");

interface StoredEvent {
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
		const bucket = getOrCreate(this.buckets, bucketKey, () => []);
		if (bucket.length >= this.cap) {
			const evicted = bucket.shift()!;
			this.seenKeys.delete(dedupeKey(evicted));
			this.removeFromIndex(evicted);
			if (this.total > 0) this.total -= 1;
		}
		bucket.push(stored);
		this.reindexEvent(stored, dedupe);
		this.dirty.add(bucketKey);
		this.total += 1;
		this.persistDebounced();
		// Broadcast to WebSocket subscribers in real-time
		try {
			broadcast(stored.eventName, stored);
		} catch {
			/* WS errors are non-fatal */
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

	/**
	 * Rebuild secondary indexes for one event. Shared by append(), load() and
	 * rollbackToBlock() so every insertion path maintains identical indexes.
	 * append() passes its precomputed dedupe key to avoid recomputing it.
	 */
	private reindexEvent(
		evt: StoredEvent,
		dedupe: string = dedupeKey(evt),
	): void {
		this.seenKeys.add(dedupe);
		this.addToIndex(this.byEventName, evt.eventName, evt, "nameIdx", 0);
		const tid = tokenIdFromPayload(evt.payload);
		if (tid !== null) this.addToIndex(this.byTokenId, tid, evt, "tokenIdx", -1);
		this.updateTransferToIndex(evt);
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
				this.reindexEvent(evt);
			}
		}
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

	private transferIndexKey(
		evt: StoredEvent,
	): { owner: string; tid: string } | null {
		if (evt.eventName !== EVENT_NAMES.Transfer) return null;
		const payload = evt.payload;
		if (!("to" in payload) || typeof payload.to !== "string") return null;
		const tid = tokenIdFromPayload(payload);
		if (tid === null) return null;
		return { owner: payload.to.toLowerCase(), tid };
	}

	private updateTransferToIndex(evt: StoredEvent): void {
		const key = this.transferIndexKey(evt);
		if (!key) return;

		const ownerMap = getOrCreate(this.byTransferTo, key.owner, () => new Map());
		const existing = ownerMap.get(key.tid);
		if (existing === undefined || evt.blockNumber > existing) {
			ownerMap.set(key.tid, evt.blockNumber);
		}
	}

	private removeFromTransferToIndex(evt: StoredEvent): void {
		const key = this.transferIndexKey(evt);
		if (!key) return;

		const ownerMap = this.byTransferTo.get(key.owner);
		if (!ownerMap || ownerMap.get(key.tid) !== evt.blockNumber) return;

		let max: number | undefined;
		const transferBucket = this.byEventName.get(EVENT_NAMES.Transfer);
		if (transferBucket) {
			for (const e of transferBucket) {
				if (e === evt) continue;
				if (!("to" in e.payload) || typeof e.payload.to !== "string") continue;
				if (e.payload.to.toLowerCase() !== key.owner) continue;
				const eTid = tokenIdFromPayload(e.payload);
				if (eTid !== key.tid) continue;
				if (max === undefined || e.blockNumber > max) max = e.blockNumber;
			}
		}

		if (max === undefined) {
			ownerMap.delete(key.tid);
			if (ownerMap.size === 0) this.byTransferTo.delete(key.owner);
		} else {
			ownerMap.set(key.tid, max);
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
	/**
	 * Remove all events at or above the given block number (reorg rollback).
	 * Rebuilds all secondary indexes (byEventName, byTokenId, byTransferTo)
	 * and clears dedup entries for removed events.
	 * @returns number of events removed
	 */
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
			const kept: StoredEvent[] = [];
			for (const evt of bucket) {
				if (evt.blockNumber >= cutoff) {
					removed += 1;
					this.seenKeys.delete(dedupeKey(evt));
				} else {
					kept.push(evt);
				}
			}
			if (kept.length > 0) {
				remaining.set(bucketKey, kept);
			} else {
				this.dirty.add(bucketKey);
			}
		}
		if (removed === 0) return 0;

		// Rebuild primary buckets and all secondary indexes from the kept events.
		// Note: indexPositions is a WeakMap — entries for removed events are
		// garbage-collected once those StoredEvent objects are dereferenced,
		// and kept events get their positions overwritten by addToIndex /
		// reindexEvent below (mirrors the load() rebuild pattern).
		this.buckets.clear();
		this.byEventName.clear();
		this.byTokenId.clear();
		this.byTransferTo.clear();
		this.total = 0;
		for (const [bucketKey, kept] of remaining) {
			this.buckets.set(bucketKey, kept);
			this.total += kept.length;
			for (const evt of kept) {
				this.reindexEvent(evt);
			}
			this.dirty.add(bucketKey);
		}
		this.persistDebounced();
		log.info("rollbackToBlock complete", {
			cutoff,
			removed,
			remaining: this.total,
		});
		return removed;
	}

	private findByDedupeKey(key: string): StoredEvent | undefined {
		if (!this.seenKeys.has(key)) return undefined;
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
	if (!singleton) {
		acquireEventStoreLock();
		singleton = new EventStore();
	}
	return singleton;
}

// ── Merged from persist.ts ──────────────────────────────────────────
// Resolved at call time (not module load) so AXIOM_DATA_DIR set after import
// takes effect — matches acquireEventStoreLock's call-time env resolution and
// lets parallel test workers use per-file data dirs.
function persistPaths(): { dir: string; file: string } {
	const dir = join(process.env.AXIOM_DATA_DIR ?? process.cwd(), ".data");
	return { dir, file: join(dir, "events.json") };
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
		if (existsSync(persistPaths().file)) {
			try {
				renameSync(persistPaths().file, `${persistPaths().file}.bak`);
			} catch {
				/* ignore */
			}
		}
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

// ── Merged from instance-lock.ts ────────────────────────────────────
const lockLog = createLogger("events-lock");

/**
 * Exclusive process lock for EventStore file persistence.
 * Prevents silent multi-instance split-brain on the same AXIOM_DATA_DIR.
 * Set AXIOM_ALLOW_MULTI_INSTANCE=true only for intentional multi-replica deploys
 * with external coordination (not supported for local JSON EventStore).
 */
export function acquireEventStoreLock(
	dataDir: string = process.env.AXIOM_DATA_DIR ?? process.cwd(),
): () => void {
	if (process.env.AXIOM_ALLOW_MULTI_INSTANCE === "true") {
		lockLog.warn(
			"AXIOM_ALLOW_MULTI_INSTANCE=true — EventStore file lock skipped (unsafe for JSON store)",
		);
		return () => {};
	}

	const lockPath = join(dataDir, ".data", "event-store.lock");
	mkdirSync(join(dataDir, ".data"), { recursive: true });

	try {
		const fd = openSync(lockPath, "wx");
		writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}\n`);
		closeSync(fd);
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code;
		if (code === "EEXIST") {
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
		}
		throw err;
	}

	const release = () => {
		try {
			if (existsSync(lockPath)) unlinkSync(lockPath);
		} catch {
			/* best-effort */
		}
	};

	process.once("exit", release);
	process.once("SIGINT", () => {
		release();
	});
	process.once("SIGTERM", () => {
		release();
	});

	return release;
}
