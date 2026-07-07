import { TTLCache } from "../utils/cache.js";
import {
  closestSnapshot,
  confirmArchived,
  lookupAccountTweets,
  lookupSnapshots,
  type SnapshotSummary,
} from "./wayback.js";

export type ArchiveQueryIntent = "lookup" | "confirm" | "account" | "closest";

export interface ArchiveQueryInput {
  intent: ArchiveQueryIntent;
  url?: string;
  handle?: string;
  limit?: number;
  timestamp?: string;
  /** When false (default), lookup uses closest-first fast path. */
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
        const snapshot = await closestSnapshot(input.url, input.timestamp);
        result = {
          url: input.url,
          count: snapshot ? 1 : 0,
          snapshots: snapshot
            ? [
                {
                  archivedAt: snapshot.iso,
                  snapshotUrl: snapshot.snapshotUrl,
                },
              ]
            : [],
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