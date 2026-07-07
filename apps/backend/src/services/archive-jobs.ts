import { randomUUID } from "node:crypto";
import { lookupAccountTweets, type SnapshotSummary } from "./wayback.js";

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