// Bun-native path helpers: POSIX-only (this repo targets Linux/WSL/bun).
// Replaces node:path join/dirname at the few data-dir call sites.
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
