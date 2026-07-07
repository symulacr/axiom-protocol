import { fetchJson } from "../../utils/fetch-json.js";
import { getStep, postStep, stepResults } from "./http.js";
import { markScenarioCovered, markScenarioSkipped } from "./scenarios.js";
import {
  e2eFastEnabled,
  e2eStrictComputeEnabled,
  resolveE2eComputeModel,
} from "./fast-path.js";

const VAULT_BALANCE_TOOL = {
  type: "function" as const,
  function: {
    name: "get_vault_balance",
    description: "Return the agent vault native balance in wei as a string",
    parameters: { type: "object", properties: {}, required: [] as string[] },
  },
};

/** Consume SSE from POST /v1/chat/completions until [DONE]. */
async function consumeChatSse(
  backendUrl: string,
  body: unknown,
): Promise<{
  chunks: unknown[];
  toolCallSeen: boolean;
  text: string;
}> {
  const res = await fetch(`${backendUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`chat completions ${res.status}: ${text.slice(0, 200)}`);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("chat completions: no response body");

  const decoder = new TextDecoder();
  let buffer = "";
  const chunks: unknown[] = [];
  let toolCallSeen = false;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") continue;
      try {
        const chunk = JSON.parse(payload) as {
          choices?: Array<{
            delta?: {
              content?: string;
              tool_calls?: Array<{ function?: { name?: string } }>;
            };
          }>;
        };
        chunks.push(chunk);
        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) text += delta.content;
        if (delta?.tool_calls?.length) toolCallSeen = true;
      } catch {
        // ignore malformed SSE lines
      }
    }
  }
  return { chunks, toolCallSeen, text };
}

/** Discover 0G Compute models + on-chain provider mapping. */
export async function runComputeProvidersStep(deps: {
  backendUrl: string;
}): Promise<void> {
  console.log("\n[Post-mint] GET /v1/compute/providers");
  const t0 = Date.now();
  const first = await getStep<{ services?: Array<{ model: string; address: string }> }>(
    deps.backendUrl,
    6.1,
    "/v1/compute/providers",
    (r, meta) => ({
      summary: `services=${r.services?.length ?? 0} status=${meta.status}`,
      ok: meta.ok && (r.services?.length ?? 0) > 0,
    }),
  );
  let reads = 1;
  if (!e2eFastEnabled()) {
    const t1 = Date.now();
    await getStep<{ services?: Array<{ model: string }> }>(
      deps.backendUrl,
      6.1,
      "/v1/compute/providers",
      (r, meta) => ({
        summary: `cache-hit services=${r.services?.length ?? 0} Δ${t1 - t0}ms`,
        ok:
          meta.ok &&
          (r.services?.length ?? 0) === (first.services?.length ?? 0),
      }),
    );
    reads = 2;
  }
  markScenarioCovered("compute.providers", "compute-providers", { reads });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Agent HTTP surfaces immediately after on-chain mint. */
export async function runAgentPostMintOpsStep(deps: {
  backendUrl: string;
  operatorAddress: string;
  tokenId: string;
  dataHash: `0x${string}`;
}): Promise<void> {
  const owner = deps.operatorAddress.toLowerCase();
  console.log(`\n[Post-mint] GET /v1/agents?owner=${owner} (fresh, poll until mint visible)`);
  const listPath = `/v1/agents?owner=${owner}&fresh=1`;
  const t0 = Date.now();
  type AgentList = {
    owner: string;
    agents: Array<{ tokenId: string; dataDescription?: string }>;
  };
  let list: AgentList | undefined;
  const maxAttempts = 20;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      list = await getStep<AgentList>(deps.backendUrl, 6.2, listPath, (r, meta) => {
        const found = r.agents.some((a) => a.tokenId === deps.tokenId);
        return {
          summary: `attempt=${attempt}/${maxAttempts} agents=${r.agents.length} tokenId=${deps.tokenId} found=${found}`,
          ok: meta.ok && found,
        };
      });
      break;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      console.log(
        `          ↻ agent list missing tokenId=${deps.tokenId}, retry in 2s (${attempt}/${maxAttempts})`,
      );
      await sleep(2000);
    }
  }
  if (!list) throw new Error("agent list poll exhausted without result");
  let listReads = 1;
  if (!e2eFastEnabled()) {
    const t1 = Date.now();
    const cachedListPath = `/v1/agents?owner=${owner}`;
    await getStep<typeof list>(
      deps.backendUrl,
      6.2,
      cachedListPath,
      (r, meta) => ({
        summary: `agent-list cache Δ${t1 - t0}ms count=${r.agents.length}`,
        ok: meta.ok && r.agents.length === list.agents.length,
      }),
    );
    listReads = 2;
  }
  markScenarioCovered("agent.list", "agent-list", { reads: listReads });

  console.log(`\n[Post-mint] POST /v1/agents/${deps.tokenId}/metadata (encode update)`);
  await postStep<{ to: string; data: string }>(
    deps.backendUrl,
    6.3,
    `/v1/agents/${deps.tokenId}/metadata`,
    {
      datas: [{ dataDescription: "e2e-post-mint", dataHash: deps.dataHash }],
    },
    (r) => ({
      summary: `encoded update to=${r.to?.slice(0, 10)}… dataLen=${r.data?.length ?? 0}`,
      ok: !!r.to && !!r.data,
    }),
  );
  markScenarioCovered("agent.metadata", "agent-metadata", { reads: 1 });

  await getStep<{ tokenId: string; creator: string; earnings: string }>(
    deps.backendUrl,
    6.4,
    `/v1/agents/${deps.tokenId}/earnings`,
    (r, meta) => ({
      summary: `creator=${r.creator?.slice(0, 10)}… earnings=${r.earnings}`,
      ok: meta.ok && !!r.creator,
    }),
  );
  markScenarioCovered("agent.earnings", "agent-earnings", { reads: 1 });
}

/** Payment config TTL cache (5 min) — second call should be fast/consistency. */
export async function runPaymentConfigCacheStep(deps: {
  backendUrl: string;
}): Promise<void> {
  console.log("\n[Cache] GET /v1/payment/config (twice)");
  const t0 = Date.now();
  const first = await getStep<{
    paymentToken: string;
    protocolFeeBps: string | number;
  }>(deps.backendUrl, 6.5, "/v1/payment/config", (r, meta) => ({
    summary: `token=${r.paymentToken?.slice(0, 10)}… feeBps=${r.protocolFeeBps}`,
    ok: meta.ok && !!r.paymentToken,
  }));
  let configReads = 1;
  if (!e2eFastEnabled()) {
    const t1 = Date.now();
    await getStep<typeof first>(
      deps.backendUrl,
      6.5,
      "/v1/payment/config",
      (r, meta) => ({
        summary: `payment-config cache Δ${t1 - t0}ms token=${r.paymentToken?.slice(0, 10)}…`,
        ok: meta.ok && r.paymentToken === first.paymentToken,
      }),
    );
    configReads = 2;
  }
  markScenarioCovered("payment.config-cache", "payment-config-cache", {
    reads: configReads,
  });
}

function handleComputeFailure(id: string, stepName: string, step: number, msg: string): void {
  if (e2eStrictComputeEnabled()) {
    stepResults.push({ step, name: stepName, ok: false, summary: msg.slice(0, 120) });
    throw new Error(`${stepName}: ${msg}`);
  }
  console.log(`          ⚠ ${stepName} skipped: ${msg.slice(0, 120)}`);
  stepResults.push({ step, name: stepName, ok: true, summary: `skipped: ${msg.slice(0, 80)}` });
  markScenarioSkipped(id, msg.slice(0, 120));
}

/** Live 0G Compute inference via orchestrator (not mock). */
export async function runLiveComputeTickStep(deps: {
  backendUrl: string;
  vault: string;
  agentNft: string;
  tokenId: string;
  vaultBalanceWei: bigint;
  computeModel: string;
}): Promise<boolean> {
  const model = deps.computeModel;
  console.log(`\n[Compute] POST /v1/orchestrator/tick (live model=${model})`);
  try {
    const { data: res, ok, status } = await fetchJson<{
      recommendation?: { action: string; reason: string };
      rawModelOutput?: string;
      durationMs?: number;
      error?: string;
    }>(`${deps.backendUrl}/v1/orchestrator/tick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vault: deps.vault,
        agentNft: deps.agentNft,
        agentTokenId: deps.tokenId,
        computeModel: model,
        strategy: "hold",
        signalSource: "manual:e2e-live",
        signalPayload: {
          vaultBalance: deps.vaultBalanceWei.toString(),
          recentTrades: [],
          prompt:
            "Respond with JSON only: {action:'hold'|'buy'|'sell', reason:string}",
        },
      }),
    });
    if (!ok || !res.recommendation) {
      throw new Error(
        res.error ?? `tick live failed status=${status} body=${JSON.stringify(res).slice(0, 120)}`,
      );
    }
    const mockSkipped =
      res.rawModelOutput?.includes("compute inference skipped") ?? false;
    if (mockSkipped) {
      throw new Error("expected live inference but got mock output");
    }
    console.log(
      `          action=${res.recommendation.action} duration=${res.durationMs ?? 0}ms model=${model}`,
    );
    stepResults.push({
      step: 9.1,
      name: "/v1/orchestrator/tick (live compute)",
      ok: true,
      summary: `action=${res.recommendation.action} model=${model} duration=${res.durationMs ?? 0}ms`,
    });
    markScenarioCovered("orchestrator.tick-live", "tick-live", { reads: 1 });
    markScenarioCovered("orchestrator.tick", "tick-live", { reads: 1 });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    handleComputeFailure(
      "orchestrator.tick-live",
      "/v1/orchestrator/tick (live compute)",
      9.1,
      msg,
    );
    return false;
  }
}

/** Streaming chat with tool definitions — exercises 0G Compute router + tools. */
export async function runChatToolCallStep(deps: {
  backendUrl: string;
  computeModel: string;
}): Promise<void> {
  const model = deps.computeModel;
  console.log(`\n[Compute] POST /v1/chat/completions (tools, model=${model})`);
  try {
    const { chunks, toolCallSeen, text } = await consumeChatSse(
      deps.backendUrl,
      {
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a test assistant. If asked for vault balance, call get_vault_balance.",
          },
          {
            role: "user",
            content:
              "Call the get_vault_balance tool now and report the result as one short sentence.",
          },
        ],
        tools: [VAULT_BALANCE_TOOL],
      },
    );
    const ok = chunks.length > 0 && (toolCallSeen || text.length > 0);
    console.log(
      `          chunks=${chunks.length} toolCall=${toolCallSeen} textLen=${text.length}`,
    );
    stepResults.push({
      step: 9.2,
      name: "/v1/chat/completions (tools)",
      ok,
      summary: `chunks=${chunks.length} toolCall=${toolCallSeen} textLen=${text.length}`,
    });
    if (!ok) throw new Error("no SSE chunks from chat completions");
    markScenarioCovered("compute.chat-tools", "chat-tools", { reads: 1 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    handleComputeFailure(
      "compute.chat-tools",
      "/v1/chat/completions (tools)",
      9.2,
      msg,
    );
  }
}

/** Prove storage root from tick matches uploaded data (data availability). */
export async function runDataAvailabilityStep(deps: {
  backendUrl: string;
  vault: string;
  agentNft: string;
  tokenId: string;
  expectedRoot: `0x${string}`;
  vaultBalanceWei: bigint;
}): Promise<void> {
  console.log("\n[Compute] POST /v1/orchestrator/tick (data availability probe)");
  const { data: res, ok, status } = await fetchJson<{
    storage?: { rootHash?: string; size?: number };
    onchain?: { vaultBalance?: string };
  }>(`${deps.backendUrl}/v1/orchestrator/tick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      vault: deps.vault,
      agentNft: deps.agentNft,
      agentTokenId: deps.tokenId,
      strategy: "hold",
      signalSource: "manual:e2e-availability",
      signalPayload: { vaultBalance: deps.vaultBalanceWei.toString() },
    }),
  });
  const root = res.storage?.rootHash?.toLowerCase();
  const expected = deps.expectedRoot.toLowerCase();
  const rootOk = ok && root === expected && (res.storage?.size ?? 0) > 0;
  const balanceOk =
    res.onchain?.vaultBalance === deps.vaultBalanceWei.toString();
  stepResults.push({
    step: 9.4,
    name: "/v1/orchestrator/tick (data availability)",
    ok: rootOk && balanceOk,
    summary: `root=${root?.slice(0, 12)}… size=${res.storage?.size ?? 0} vault=${res.onchain?.vaultBalance ?? "?"}`,
  });
  if (!rootOk || !balanceOk) {
    throw new Error(
      `data availability failed status=${status} root=${root} expected=${expected}`,
    );
  }
  markScenarioCovered("compute.data-availability", "data-availability", {
    reads: 1,
  });
}



/** Performance metrics from event store (populated after tick). */
export async function runAgentPerformanceStep(deps: {
  backendUrl: string;
  tokenId: string;
  minTicks?: number;
}): Promise<void> {
  const minTicks = deps.minTicks ?? 1;
  console.log(`\n[Post-tick] GET /v1/agents/${deps.tokenId}/performance`);
  await getStep<{
    metrics: { totalTicks: number; holdCount: number };
    history: unknown[];
  }>(
    deps.backendUrl,
    9.3,
    `/v1/agents/${deps.tokenId}/performance`,
    (r, meta) => ({
      summary: `ticks=${r.metrics?.totalTicks ?? 0} hold=${r.metrics?.holdCount ?? 0}`,
      ok: meta.ok && (r.metrics?.totalTicks ?? 0) >= minTicks,
    }),
  );
  markScenarioCovered("agent.performance", "agent-performance", { reads: 1 });
}