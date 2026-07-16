import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, getEnv } from "../env.js";
import { runAxiomCoreLoadBench } from "./e2e/load-bench.js";

loadEnv();

const BACKEND_URL = getEnv("BACKEND_URL", "http://127.0.0.1:3000");
const REUSE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../.data/e2e-last.json",
);

function resolveTokenId(): string {
  const explicit = process.env.BENCH_TOKEN_ID?.trim();
  if (explicit) return explicit;
  if (existsSync(REUSE_PATH)) {
    const snap = JSON.parse(readFileSync(REUSE_PATH, "utf8")) as { tokenId?: string };
    if (snap.tokenId) return snap.tokenId;
  }
  return "1";
}

const concurrencies = (process.env.BENCH_CONCURRENCY ?? "1,5,10,20")
  .split(",")
  .map((s) => Number.parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n) && n > 0);

const iterations = Number.parseInt(process.env.BENCH_ITERATIONS ?? "40", 10);

async function main(): Promise<void> {
  const results = await runAxiomCoreLoadBench({
    backendUrl: BACKEND_URL,
    tokenId: resolveTokenId(),
    concurrencies,
    iterationsPerLane: Number.isFinite(iterations) ? iterations : 40,
  });
  const failed = results.filter((r) => r.reliabilityPct < 95);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});