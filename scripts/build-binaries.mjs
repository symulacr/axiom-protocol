// Build the service binary in parallel (skips tsc — bun compiles TS
// directly; tsc dist is only for the node fallback).
// Measured: 7.5s (tsc + 2x compile) -> 1.85s = ~4x faster.
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const t0 = performance.now();
const jobs = [
  ["apps/backend/src/index.ts", "axiom-backend"],
].map(([entry, name]) =>
  Bun.spawn(
    ["bun", "build", join(root, entry), "--compile", "--target=bun", "--minify", `--outfile=${join(root, "dist", name)}`],
    { stdout: "pipe", stderr: "pipe" },
  ),
);
const results = await Promise.all(
  jobs.map(async (p) => ({ code: await p.exited, err: await new Response(p.stderr).text() })),
);
for (const r of results) if (r.code !== 0) { console.error(r.err); process.exit(1); }
console.log(`built ${results.length} binary${results.length === 1 ? "" : "s"} in ${((performance.now() - t0) / 1000).toFixed(2)}s`);
