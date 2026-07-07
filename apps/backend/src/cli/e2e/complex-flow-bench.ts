/**
 * Complex multi-tool flow — mirrors ChatPage tool loop with parallel read batch.
 */

import { ethers } from "ethers";
import { executeE2eTool, type E2eToolDeps } from "./transport-node.js";
import { markScenarioCovered, markScenarioSkipped } from "./scenarios.js";
import type { ChatBenchResult } from "./chat-bench.js";
import {
  benchSkipsOrchestrateWhenNotReady,
  probeTickReady,
} from "./tick-ready.js";

export async function runComplexToolFlowBench(
  deps: E2eToolDeps,
): Promise<ChatBenchResult> {
  const t0 = performance.now();
  const steps: string[] = [];
  try {
    const [list, bal] = await Promise.all([
      executeE2eTool("list_my_agents", {}, deps),
      executeE2eTool("vault_balance", { tokenId: deps.tokenId }, deps),
    ]);
    steps.push("list∥balance");
    if (!list.ok) throw new Error("list_my_agents failed");
    if (!bal.ok) throw new Error("vault_balance failed");

    const meta = await executeE2eTool(
      "agent_metadata",
      { tokenId: deps.tokenId },
      deps,
    );
    steps.push("metadata");
    if (!meta.ok) throw new Error("agent_metadata failed");

    const events = await executeE2eTool(
      "event_history",
      { eventName: "Tick", limit: 5 },
      deps,
    );
    steps.push("events");
    if (!events.ok) throw new Error("event_history failed");

    const liveCompute = process.env.E2E_LIVE_COMPUTE !== "0";
    const tickState = await probeTickReady(deps.vault, deps.tokenId);
    if (!tickState.ready && benchSkipsOrchestrateWhenNotReady(liveCompute)) {
      steps.push("tick-skipped");
    } else {
      const tick = await executeE2eTool(
        "execute_tick",
        { tokenId: deps.tokenId },
        deps,
      );
      steps.push("tick");
      if (!tick.ok) throw new Error("execute_tick failed");
    }

    const encode = await executeE2eTool(
      "mint_agent",
      { dataDescription: "complex-flow", dataHash: ethers.ZeroHash },
      deps,
    );
    steps.push("encode");
    if (!encode.ok) throw new Error("mint encode failed");

    markScenarioCovered("chat.tools-complex", "chat-complex-flow", {
      reads: steps.length,
    });
    return {
      id: "flow.complex-tools",
      ok: true,
      ms: Math.round(performance.now() - t0),
      summary: `steps=${steps.join("→")}`,
    };
  } catch (err) {
    markScenarioSkipped(
      "chat.tools-complex",
      err instanceof Error ? err.message : String(err),
    );
    return {
      id: "flow.complex-tools",
      ok: false,
      ms: Math.round(performance.now() - t0),
      summary: `failed at ${steps.join("→")}`,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}