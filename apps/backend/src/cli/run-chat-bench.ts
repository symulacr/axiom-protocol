import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, getEnv } from "../env.js";
import { initUsageScenarios } from "./e2e/scenarios.js";
import { resetFrictionFindings } from "./e2e/friction.js";
import { buildChatEval, printChatEval } from "./e2e/eval.js";
import { runChatBench, printChatBenchReport } from "./e2e/chat-bench.js";
import { resolveE2eWallets } from "./e2e/wallet.js";
import { getSharedProvider } from "../provider.js";
import { GALILEO_CHAIN_ID } from "@axiom/config/networks";

loadEnv();

const BACKEND_URL = getEnv("BACKEND_URL", "http://127.0.0.1:3000");
const REUSE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../.data/e2e-last.json",
);

function resolveTokenId(): string {
  const explicit = process.env.CHAT_BENCH_TOKEN_ID?.trim();
  if (explicit) return explicit;
  if (existsSync(REUSE_PATH)) {
    const snap = JSON.parse(readFileSync(REUSE_PATH, "utf8")) as { tokenId?: string };
    if (snap.tokenId) return snap.tokenId;
  }
  return "1";
}

async function main(): Promise<void> {
  initUsageScenarios();
  resetFrictionFindings();

  const { operator } = resolveE2eWallets(getSharedProvider(GALILEO_CHAIN_ID));
  const liveCompute = process.env.E2E_LIVE_COMPUTE !== "0";
  const contextRounds = Number.parseInt(process.env.CHAT_BENCH_CONTEXT_ROUNDS ?? "4", 10);
  const keepAliveRounds = Number.parseInt(process.env.CHAT_BENCH_KEEPALIVE_ROUNDS ?? "3", 10);

  console.log("\n============================================");
  console.log("  Axiom Chat Bench");
  console.log("============================================");
  console.log(`  Backend: ${BACKEND_URL}`);
  console.log(`  Operator: ${operator.address}`);
  console.log(`  tokenId: ${resolveTokenId()}`);
  console.log(`  liveCompute: ${liveCompute ? "on" : "off"}`);
  console.log(`  contextRounds: ${contextRounds}  keepAliveRounds: ${keepAliveRounds}`);

  const report = await runChatBench({
    backendUrl: BACKEND_URL,
    operatorAddress: operator.address,
    tokenId: resolveTokenId(),
    liveCompute,
    operatorSigner: operator,
    contextRounds: Number.isFinite(contextRounds) ? contextRounds : 4,
    keepAliveRounds: Number.isFinite(keepAliveRounds) ? keepAliveRounds : 3,
  });

  printChatBenchReport(report);
  const evalReport = buildChatEval(report);
  printChatEval(evalReport);

  const failed = report.results.filter(
    (r) =>
      !r.ok &&
      !r.summary.includes("skipped") &&
      !r.summary.includes("N/A"),
  );

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});