// Bun-native path + atomic-file helpers (POSIX-only); shared by every JSON persistence site.
import { mkdirSync, renameSync, writeFileSync } from "node:fs";

export function joinPath(...parts: string[]): string {
  const cleaned = parts
    .filter((p) => p.length > 0)
    .map((p) => p.replace(/\/+$/, ""));
  return cleaned.join("/");
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
  writeFileSync(
    tmp,
    data,
    opts?.mode !== undefined ? { mode: opts.mode } : undefined,
  );
  renameSync(tmp, file);
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
