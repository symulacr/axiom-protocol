import { randomUUID } from "node:crypto";
import { TTLCache } from "../utils/cache.js";
import {
  closestSnapshot,
  confirmArchived,
  lookupAccountTweets,
  lookupSnapshots,
  type SnapshotSummary,
} from "./wayback.js";

export type ArchiveJobStatus = "pending" | "running" | "done" | "failed";

export interface ArchiveAccountJob {
  id: string;
  status: ArchiveJobStatus;
  handle: string;
  limit: number;
  createdAt: number;
  finishedAt?: number;
  snapshots?: SnapshotSummary[];
  error?: string;
}

const jobs = new Map<string, ArchiveAccountJob>();
const JOB_TTL_MS = 30 * 60 * 1000;

function pruneExpired(): void {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}

export function createAccountArchiveJob(
  handle: string,
  limit = 100,
): ArchiveAccountJob {
  pruneExpired();
  const job: ArchiveAccountJob = {
    id: randomUUID(),
    status: "pending",
    handle,
    limit,
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  void runAccountArchiveJob(job.id);
  return job;
}

export function getArchiveJob(id: string): ArchiveAccountJob | undefined {
  pruneExpired();
  return jobs.get(id);
}

async function runAccountArchiveJob(id: string): Promise<void> {
  const job = jobs.get(id);
  if (!job || job.status !== "pending") return;
  job.status = "running";
  try {
    const snapshots = await lookupAccountTweets(job.handle, job.limit);
    job.snapshots = snapshots;
    job.status = "done";
    job.finishedAt = Date.now();
  } catch (err) {
    job.status = "failed";
    job.error = err instanceof Error ? err.message : String(err);
    job.finishedAt = Date.now();
  }
}

export type ArchiveQueryIntent = "lookup" | "confirm" | "account" | "closest";

export interface ArchiveQueryInput {
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
