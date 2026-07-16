import {
  openSync,
  writeFileSync,
  closeSync,
  unlinkSync,
  existsSync,
  readFileSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { createLogger } from "../utils/logger.js";

const log = createLogger("events-lock");

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
    log.warn(
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
        holder = readFileSync(lockPath, "utf-8").trim().split("\n")[0] ?? holder;
      } catch {
        /* ignore */
      }
      throw new Error(
        `EventStore lock held (pid ${holder}) at ${lockPath}. ` +
          `Refuse multi-instance on the same data dir. ` +
          `Stop the other process, delete the stale lock, or set AXIOM_ALLOW_MULTI_INSTANCE=true (unsafe).`,
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
