import {
  computeLiveGate,
  assertLiveGate,
  getUsageScenarios,
  type LiveGateReport,
} from "./scenarios.js";
import type { ChatBenchReport } from "./chat-bench.js";
import { printBanner } from "./shared.js";

const LIVE_CRITICAL_IDS = [
  "api.health",
  "api.routes",
  "events.feed",
  "api.stream",
  "agent.list",
  "agent.performance",
  "agent.performance-batch",
  "payment.royalty-encode",
  "orchestrator.tick",
  "compute.chat-tools",
  "transfer.proof",
  "agent.mint",
] as const;

function printLiveGate(minPct = 85): LiveGateReport {
  const report = computeLiveGate(LIVE_CRITICAL_IDS);
  printBanner("Live Path Gate");
  console.log(
    `  Live proof: ${report.live}/${report.inScope} (${report.livePct}%)  |  critical ${report.criticalLive}/${report.criticalTotal}`,
  );
  if (report.gaps.length > 0) {
    console.log("\n  Gaps:");
    for (const g of report.gaps.slice(0, 16)) {
      console.log(`  • ${g}`);
    }
    if (report.gaps.length > 16) {
      console.log(`  … +${report.gaps.length - 16} more`);
    }
  } else {
    console.log("  All in-scope scenarios have live proof.");
  }
  const criticalOk = report.criticalLive >= report.criticalTotal;
  const pctOk = report.livePct >= minPct;
  if (!pctOk || !criticalOk) {
    console.log(
      `\n  Live gate failed — need ≥${minPct}% live proof and all ${report.criticalTotal} critical paths`,
    );
  } else {
    console.log(
      `\n  Live gate passed (≥${minPct}%, critical ${report.criticalTotal}/${report.criticalTotal})`,
    );
  }
  return report;
}

export function enforceLiveGate(minPct: number): LiveGateReport {
  printLiveGate(minPct);
  return assertLiveGate(minPct, LIVE_CRITICAL_IDS);
}

interface ChatEvalReport {
  scorePct: number;
  toolParityPct: number;
  dimensions: Array<{ id: string; ok: boolean; detail: string }>;
}

export const CHAT_EVAL_IDS = [
  "chat.tools-read",
  "chat.tools-write",
  "chat.tools-complex",
  "chat.cache-hit",
  "chat.keepalive",
  "chat.context-growth",
  "chat.model-switch",
  "compute.chat-tools",
] as const;

const LIVE_CHAT_IDS = new Set([
  "chat.keepalive",
  "chat.context-growth",
  "chat.model-switch",
  "compute.chat-tools",
]);

export function buildChatEval(bench: ChatBenchReport): ChatEvalReport {
  const scenarios = getUsageScenarios();
  const covered = new Set(
    scenarios.filter((s) => s.status === "covered").map((s) => s.id),
  );
  const dimensions = CHAT_EVAL_IDS.map((id) => {
    const scenario = scenarios.find((s) => s.id === id);
    const hit = covered.has(id);
    const skipped = scenario?.status === "skipped";
    const liveSkipped = !bench.liveCompute && LIVE_CHAT_IDS.has(id) && skipped;
    return {
      id,
      ok: hit || liveSkipped,
      detail: hit
        ? "covered"
        : liveSkipped
          ? "skipped (live compute off)"
          : skipped
            ? `skipped: ${scenario?.skipReason ?? "?"}`
            : "not covered",
    };
  });

  const dimOk = dimensions.filter((d) => d.ok).length;
  const dimPct = Math.round((dimOk / CHAT_EVAL_IDS.length) * 100);
  const scorePct = Math.round(dimPct * 0.6 + bench.toolParityPct * 0.4);

  return {
    scorePct,
    toolParityPct: bench.toolParityPct,
    dimensions,
  };
}

export function printChatEval(report: ChatEvalReport): void {
  printBanner("Chat Eval");
  console.log(
    `  Score: ${report.scorePct}%  |  tool parity: ${report.toolParityPct}%`,
  );
  for (const d of report.dimensions) {
    const flag = d.ok ? "OK" : "MISS";
    console.log(`  ${flag.padEnd(4)} ${d.id.padEnd(22)} ${d.detail}`);
  }
  if (report.scorePct < 80) {
    console.log("\n  ⚠ Chat eval below 80% — review tool/SSE coverage");
  } else {
    console.log("\n  Chat eval passed (≥80%)");
  }
}
