import { TTLCache } from "../utils/cache.js";
import { extractErrorMessage } from "../utils/response.js";

type ArchiveQueryIntent = "lookup" | "confirm" | "account" | "closest";

interface ArchiveQueryInput {
	intent: ArchiveQueryIntent;
	url?: string;
	handle?: string;
	limit?: number;
	timestamp?: string;
	fullList?: boolean;
}

const CDX_CACHE_TTL_MS = 5 * 60 * 1000;
const cdxCache = new TTLCache<unknown>(CDX_CACHE_TTL_MS);

function cacheKey(input: ArchiveQueryInput): string {
	return JSON.stringify({
		intent: input.intent,
		url: input.url,
		handle: input.handle,
		limit: input.limit ?? null,
		timestamp: input.timestamp ?? null,
		fullList: input.fullList ?? false,
	});
}

export async function queryArchive(input: ArchiveQueryInput): Promise<unknown> {
	const key = cacheKey(input);
	const cached = cdxCache.get(key);
	if (cached !== undefined) return { ...asRecord(cached), cached: true };

	let result: unknown;
	switch (input.intent) {
		case "closest": {
			if (!input.url) throw new Error("url required for closest intent");
			const snapshot = await closestSnapshot(input.url, input.timestamp);
			result = { url: input.url, snapshot };
			break;
		}
		case "confirm": {
			if (!input.url) throw new Error("url required for confirm intent");
			result = await confirmArchived(input.url);
			break;
		}
		case "account": {
			if (!input.handle) throw new Error("handle required for account intent");
			const snapshots = await lookupAccountTweets(
				input.handle,
				input.limit ?? 100,
			);
			result = {
				handle: input.handle,
				count: snapshots.length,
				snapshots,
			};
			break;
		}
		case "lookup": {
			if (!input.url) throw new Error("url required for lookup intent");
			const useFullList = input.fullList === true || (input.limit ?? 0) > 1;
			if (!useFullList) {
				const snapshots = await lookupSnapshots(input.url, 1);
				result = {
					url: input.url,
					count: snapshots.length,
					snapshots: snapshots.map((s) => ({
						archivedAt: s.iso,
						snapshotUrl: s.snapshotUrl,
					})),
					note: "closest-first fast path",
				};
			} else {
				const snapshots: SnapshotSummary[] = await lookupSnapshots(
					input.url,
					input.limit ?? 50,
				);
				result = {
					url: input.url,
					count: snapshots.length,
					snapshots,
				};
			}
			break;
		}
		default:
			throw new Error(`Unknown archive intent: ${String(input.intent)}`);
	}

	cdxCache.set(key, result);
	return result;
}

function asRecord(value: unknown): Record<string, unknown> {
	if (typeof value === "object" && value !== null) {
		return value as Record<string, unknown>;
	}
	return { value };
}

interface SnapshotSummary {
	url: string;
	timestamp: string;
	iso: string;
	snapshotUrl: string;
	digest?: string;
}

function waybackTimestampToIso(timestamp: string): string {
	return new Date(
		`${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:${timestamp.slice(12, 14)}Z`,
	).toISOString();
}

async function fetchCdxRows(cdxUrl: string): Promise<string[][]> {
	const resp = await fetch(cdxUrl, { signal: AbortSignal.timeout(20_000) });
	if (!resp.ok) throw new Error(`CDX returned ${resp.status}`);
	const rows = (await resp.json()) as string[][];
	if (!Array.isArray(rows) || rows.length < 2) return [];
	return rows.slice(1);
}

function normalizeCdxRow(originalUrl: string, row: string[]): SnapshotSummary {
	const [timestamp, orig, , , digest] = row;
	return {
		url: orig ?? originalUrl,
		timestamp: timestamp ?? "",
		iso: timestamp ? waybackTimestampToIso(timestamp) : "",
		snapshotUrl: `https://web.archive.org/web/${timestamp}/${orig ?? originalUrl}`,
		digest,
	};
}

async function lookupSnapshots(
	url: string,
	limit = 50,
): Promise<SnapshotSummary[]> {
	const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json&fl=timestamp,original,statuscode,mimetype,digest&collapse=urlkey&limit=${limit}`;
	try {
		const rows = await fetchCdxRows(cdxUrl);
		return rows.map((row) => normalizeCdxRow(url, row));
	} catch {
		const closest = await closestSnapshot(url);
		return closest ? [closest] : [];
	}
}

async function lookupAccountTweets(
	handle: string,
	limit = 100,
): Promise<SnapshotSummary[]> {
	const cleanHandle = handle.replace(/^@/, "").trim();
	const baseUrl = `x.com/${cleanHandle}/status/`;
	const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(baseUrl)}&matchType=prefix&output=json&fl=timestamp,original,statuscode,mimetype,digest&collapse=urlkey&limit=${limit}`;
	try {
		const rows = await fetchCdxRows(cdxUrl);
		return rows.map((row) => normalizeCdxRow(baseUrl, row));
	} catch {
		return [];
	}
}

async function confirmArchived(
	tweetUrl: string,
): Promise<{ archived: boolean; snapshot: SnapshotSummary | null }> {
	try {
		const snapshots = await lookupSnapshots(tweetUrl, 10);
		if (snapshots.length === 0) return { archived: false, snapshot: null };
		const snapshot = snapshots[0];
		if (!snapshot) return { archived: false, snapshot: null };
		return { archived: true, snapshot };
	} catch (err) {
		throw new Error(`Wayback confirm failed: ${extractErrorMessage(err)}`, {
			cause: err,
		});
	}
}

async function closestSnapshot(
	url: string,
	timestamp?: string,
): Promise<SnapshotSummary | null> {
	const ts =
		timestamp ?? new Date().toISOString().replace(/[-:]/g, "").slice(0, 14);
	try {
		const apiUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}&timestamp=${ts}`;
		const resp = await fetch(apiUrl);
		const data = (await resp.json()) as {
			archived_snapshots?: { closest?: { url: string; timestamp: string } };
		};
		const closest = data.archived_snapshots?.closest;
		if (!closest) return null;
		return {
			url,
			timestamp: closest.timestamp,
			iso: waybackTimestampToIso(closest.timestamp),
			snapshotUrl: closest.url,
		};
	} catch {
		return null;
	}
}
