// Bun-native path + atomic-file helpers (POSIX-only); shared by every JSON persistence site.
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, rename } from "node:fs/promises";

export function joinPath(...parts: string[]): string {
  return parts
    .filter((p) => p.length > 0)
    .map((p) => p.replace(/\/+$/, ""))
    .join("/");
}

export function dirnamePath(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx <= 0 ? "/" : p.slice(0, idx);
}

/** Path under the durable data home `AXIOM_DATA_DIR/.data` (default `./.data`).
 *  Resolved per call so env changes after import take effect (test isolation). */
export function dataFilePath(...segments: string[]): string {
  return joinPath(
    process.env.AXIOM_DATA_DIR ?? process.cwd(),
    ".data",
    ...segments,
  );
}

/** Atomic tmp+rename write: readers see the old file or the new one, never a
 *  partial write. Tmp name carries pid+uuid so concurrent writers never clobber. */
export function atomicWriteFileSync(
  file: string,
  data: string,
  opts?: { mode?: number },
): void {
  mkdirSync(dirnamePath(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  writeFileSync(tmp, data, opts);
  renameSync(tmp, file);
}

/** Async atomic tmp+rename write for durability paths (event buckets, indexer
 *  checkpoints): the full tmp write completes before the rename, so readers see
 *  old or new content, never a partial write. */
export async function writeFileAtomic(
  file: string,
  data: string,
): Promise<void> {
  await mkdir(dirnamePath(file), { recursive: true });
  const tmp = `${file}.tmp`;
  // Bun.write for speed; rename is the atomicity point.
  await Bun.write(tmp, data);
  await rename(tmp, file);
}

/** Best-effort rename of a corrupt file aside to `<file>.bak`; failures (and a
 *  missing source) are swallowed — backup must never block startup. */
export function backupFileBestEffort(file: string): void {
  try {
    renameSync(file, `${file}.bak`);
  } catch {
    /* best-effort */
  }
}
