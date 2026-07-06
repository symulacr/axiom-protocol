import { readFileSync, renameSync, existsSync } from "node:fs";
import { writeFile, rename, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "../utils/logger.js";
import { extractErrorMessage } from "../utils/response.js";

const log = createLogger("events");

const PERSIST_DIR = join(process.env.AXIOM_DATA_DIR ?? process.cwd(), ".data");
export const PERSIST_FILE = join(PERSIST_DIR, "events.json");

export async function ensurePersistDir(): Promise<void> {
  await mkdir(PERSIST_DIR, { recursive: true });
}

/**
 * Load persisted bucket arrays from disk. Returns an empty Map when the file
 * is missing, corrupt, or unreadable (corrupt files are quarantined to `.bak`).
 */
export function loadBuckets(): Map<string, unknown[]> {
  try {
    if (!existsSync(PERSIST_FILE)) return new Map();
    const raw = readFileSync(PERSIST_FILE, "utf-8");
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
    log.warn("persist file corrupt or unreadable, starting fresh", {
      error: extractErrorMessage(err),
    });
    if (existsSync(PERSIST_FILE)) {
      try {
        renameSync(PERSIST_FILE, `${PERSIST_FILE}.bak`);
      } catch {
        // Best-effort quarantine; continue with empty store.
      }
    }
    return new Map();
  }
}

export async function saveBuckets(
  buckets: Map<string, unknown[]>,
): Promise<void> {
  await ensurePersistDir();
  const data = Object.fromEntries(buckets);
  const tmp = `${PERSIST_FILE}.tmp`;
  await writeFile(
    tmp,
    JSON.stringify(data, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );
  await rename(tmp, PERSIST_FILE);
}