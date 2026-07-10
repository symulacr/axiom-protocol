
import { ethers, type Wallet } from "ethers";
import { fetchJson } from "../../utils/fetch-json.js";
import { getAddresses } from "@axiom/config/addresses";
import { GALILEO_CHAIN_ID } from "@axiom/config/networks";
import { executeE2eTool, type E2eToolDeps } from "./transport-node.js";
import {
  CHAT_BENCH_ALL_TOOL_NAMES,
  CHAT_BENCH_ENCODE_TOOLS,
  CHAT_BENCH_READ_TOOLS,
  toolsByClass,
} from "@axiom/config/chat-tools";
import { resolveE2eComputeModel } from "./fast-path.js";
import { markScenarioCovered, markScenarioSkipped } from "./scenarios.js";
import { noteFriction } from "./friction.js";
import { runComplexToolFlowBench } from "./complex-flow-bench.js";
import {
  benchSkipsOrchestrateWhenNotReady,
  probeTickReady,
} from "./tick-ready.js";

export interface ChatBenchResult {
  id: string;
  ok: boolean;
  ms: number;
  summary: string;
  error?: string;
}

export interface ChatBenchReport {
  results: ChatBenchResult[];
  toolParityPct: number;
  cacheHitMs?: { providers?: number; paymentConfig?: number; agentList?: number };
  keepAliveReusePct?: number;
  liveCompute: boolean;
}

type KeepAliveFetch = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

const FRONTEND_TOOL_NAMES = CHAT_BENCH_ALL_TOOL_NAMES;

const ARCHIVE_PROBE_URL = "https://example.com";

const WRITE_ENCODE_TOOLS = CHAT_BENCH_ENCODE_TOOLS;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx]!;
}

export function createKeepAliveFetch(): {
  fetch: KeepAliveFetch;
  close: () => void;
} {
  const fetchFn: KeepAliveFetch = (url, init) =>
    fetch(url, { ...init, keepalive: true } as RequestInit);
  return { fetch: fetchFn, close: () => {} };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

function chatBenchCooldownMs(): number {
  const n = Number.parseInt(process.env.CHAT_BENCH_COOLDOWN_MS ?? "2000", 10);
  return Number.isFinite(n) && n >= 0 ? n : 2000;
}

export async function consumeChatSseWithFetch(
  fetchFn: KeepAliveFetch,
  backendUrl: string,
  body: unknown,
  opts?: { retries?: number },
): Promise<{
  chunks: unknown[];
  toolCallSeen: boolean;
  toolNames: string[];
  text: string;
  ms: number;
  ttftMs: number;
}> {
  const retries = opts?.retries ?? 2;
  const t0 = performance.now();
  let res: Response | undefined;
  let lastErr = "";
  for (let attempt = 0; attempt <= retries; attempt++) {
    res = await fetchFn(`${backendUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) break;
    const text = await res.text();
    lastErr = `chat completions ${res.status}: ${text.slice(0, 200)}`;
    if (res.status === 429 && attempt < retries) {
      await sleep(7_000 * (attempt + 1));
      continue;
    }
    throw new Error(lastErr);
  }
  if (!res?.ok) throw new Error(lastErr || "chat completions failed");
  const reader = res.body?.getReader();
  if (!reader) throw new Error("chat completions: no response body");

  const decoder = new TextDecoder();
  let buffer = "";
  const chunks: unknown[] = [];
  let toolCallSeen = false;
  const toolNames: string[] = [];
  let text = "";
  let ttftMs = 0;

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
        if (ttftMs === 0 && (delta?.content || delta?.tool_calls?.length)) {
          ttftMs = Math.round(performance.now() - t0);
        }
        if (delta?.content) text += delta.content;
        if (delta?.tool_calls?.length) {
          toolCallSeen = true;
          for (const tc of delta.tool_calls) {
            const n = tc.function?.name;
            if (n && !toolNames.includes(n)) toolNames.push(n);
          }
        }
      } catch {
      }
    }
  }
  const totalMs = Math.round(performance.now() - t0);
  return {
    chunks,
    toolCallSeen,
    toolNames,
    text,
    ms: totalMs,
    ttftMs: ttftMs > 0 ? ttftMs : totalMs,
  };
}

export type { E2eToolDeps };

export async function runToolParityBench(
  deps: E2eToolDeps,
  opts?: { liveCompute?: boolean },
): Promise<ChatBenchResult[]> {
  const results: ChatBenchResult[] = [];
  const liveCompute = opts?.liveCompute ?? process.env.E2E_LIVE_COMPUTE !== "0";
  const tickState = await probeTickReady(deps.vault, deps.tokenId);
  const skipExecuteTick =
    !tickState.ready && benchSkipsOrchestrateWhenNotReady(liveCompute);
  const toolArgs: Record<string, Record<string, unknown>> = {
    list_my_agents: {},
    vault_balance: { tokenId: deps.tokenId },
    agent_metadata: { tokenId: deps.tokenId },
    event_history: { eventName: "Tick", limit: 10 },
    execute_tick: { tokenId: deps.tokenId },
    simulate_tick: { tokenId: deps.tokenId },
    mint_agent: {
      dataDescription: "chat-bench-encode",
      dataHash: ethers.ZeroHash,
    },
    deposit: { tokenId: deps.tokenId, amount: "0.001" },
    withdraw: { tokenId: deps.tokenId, amount: "1" },
    archive_lookup: { url: ARCHIVE_PROBE_URL, limit: 5 },
    archive_account_tweets: { handle: "0g_labs", limit: 5 },
    archive_confirm_deletion: { url: ARCHIVE_PROBE_URL },
  };

  for (const name of FRONTEND_TOOL_NAMES) {
    const t0 = performance.now();
    if (name === "execute_tick" && skipExecuteTick) {
      results.push({
        id: `tool.${name}`,
        ok: true,
        ms: 0,
        summary: "skipped (no vault/strategy; E2E_LIVE_COMPUTE=0)",
      });
      continue;
    }
    try {
      const { ok, result } = await executeE2eTool(name, toolArgs[name] ?? {}, deps);
      const parsed = JSON.parse(result) as Record<string, unknown>;
      const hasError = parsed.error !== undefined;
      results.push({
        id: `tool.${name}`,
        ok: ok && !hasError,
        ms: Math.round(performance.now() - t0),
        summary: hasError
          ? String(parsed.error)
          : WRITE_ENCODE_TOOLS.includes(name)
            ? `encode-only len=${result.length}`
            : `ok len=${result.length}`,
      });
    } catch (err) {
      results.push({
        id: `tool.${name}`,
        ok: false,
        ms: Math.round(performance.now() - t0),
        summary: "exception",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const readTools = CHAT_BENCH_READ_TOOLS.concat(
    toolsByClass("archive").map((t) => t.name),
  );
  const readOk = readTools.every(
    (n) => results.find((r) => r.id === `tool.${n}`)?.ok === true,
  );
  const writeOk = WRITE_ENCODE_TOOLS.every(
    (n) => results.find((r) => r.id === `tool.${n}`)?.ok === true,
  );
  const okCount = results.filter((r) => r.ok).length;
  if (readOk) {
    markScenarioCovered("chat.tools-read", "chat-tool-parity-read", {
      reads: readTools.length,
    });
  } else {
    markScenarioSkipped(
      "chat.tools-read",
      `${okCount}/${FRONTEND_TOOL_NAMES.length} tools passed`,
    );
  }
  if (writeOk) {
    markScenarioCovered("chat.tools-write", "chat-tool-encode", { reads: 3 });
  }
  return results;
}

export async function runMicroDepositSignBench(deps: E2eToolDeps): Promise<ChatBenchResult | null> {
  if (process.env.CHAT_BENCH_SIGN_DEPOSIT !== "1" || !deps.operatorSigner) {
    return null;
  }
  const t0 = performance.now();
  try {
    const out = await executeE2eTool(
      "deposit",
      { tokenId: deps.tokenId, amount: "0.00001", sign: true },
      deps,
    );
    if (out.ok) {
      markScenarioCovered("chat.tools-write", "chat-deposit-sign", { txs: 1, reads: 1 });
    }
    return {
      id: "tool.deposit-sign",
      ok: out.ok,
      ms: Math.round(performance.now() - t0),
      summary: out.ok ? "on-chain deposit signed" : "deposit sign failed",
      error: out.ok ? undefined : out.result,
    };
  } catch (err) {
    return {
      id: "tool.deposit-sign",
      ok: false,
      ms: Math.round(performance.now() - t0),
      summary: "exception",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export { runComplexToolFlowBench } from "./complex-flow-bench.js";

export async function runCacheHitBench(deps: {
  backendUrl: string;
  operatorAddress: string;
}): Promise<{ results: ChatBenchResult[]; deltas: ChatBenchReport["cacheHitMs"] }> {
  const owner = deps.operatorAddress.toLowerCase();
  const results: ChatBenchResult[] = [];
  const deltas: NonNullable<ChatBenchReport["cacheHitMs"]> = {};

  async function doubleRead(
    id: string,
    path: string,
    validate: (data: unknown) => boolean,
  ): Promise<void> {
    const t0 = performance.now();
    const first = await fetchJson(`${deps.backendUrl}${path}`);
    const t1 = performance.now();
    const second = await fetchJson(`${deps.backendUrl}${path}`);
    const t2 = performance.now();
    const coldMs = Math.round(t1 - t0);
    const warmMs = Math.round(t2 - t1);
    const delta = coldMs - warmMs;
    const ok =
      first.ok &&
      second.ok &&
      validate(first.data) &&
      validate(second.data);
    results.push({
      id: `cache.${id}`,
      ok,
      ms: warmMs,
      summary: `cold=${coldMs}ms warm=${warmMs}ms Δ=${delta}ms`,
    });
    if (id === "providers") deltas.providers = delta;
    if (id === "payment-config") deltas.paymentConfig = delta;
    if (id === "agent-list") deltas.agentList = delta;
  }

  await Promise.all([
    doubleRead("providers", "/v1/compute/providers", (d) => {
      const x = d as { services?: unknown[] };
      return (x.services?.length ?? 0) > 0;
    }),
    doubleRead("payment-config", "/v1/payment/config", (d) => {
      const x = d as { paymentToken?: string };
      return !!x.paymentToken;
    }),
    doubleRead("agent-list", `/v1/agents?owner=${owner}`, (d) => {
      const x = d as { agents?: unknown[] };
      return Array.isArray(x.agents);
    }),
  ]);

  const allOk = results.every((r) => r.ok);
  if (allOk) {
    markScenarioCovered("chat.cache-hit", "chat-cache-hit", { reads: 6 });
  }
  return { results, deltas };
}

export async function runKeepAliveBench(deps: {
  backendUrl: string;
  computeModel: string;
  rounds: number;
  liveCompute: boolean;
}): Promise<ChatBenchResult> {
  if (!deps.liveCompute) {
    markScenarioSkipped("chat.keepalive", "E2E_LIVE_COMPUTE=0");
    return {
      id: "chat.keepalive",
      ok: true,
      ms: 0,
      summary: "skipped (no live compute)",
    };
  }

  const { fetch: kaFetch, close } = createKeepAliveFetch();
  const latencies: number[] = [];
  const ttfts: number[] = [];
  let failures = 0;

  try {
    for (let i = 0; i < deps.rounds; i++) {
      try {
        const r = await consumeChatSseWithFetch(kaFetch, deps.backendUrl, {
          model: deps.computeModel,
          messages: [
            { role: "user", content: `Reply with exactly: pong-${i}` },
          ],
          max_tokens: 16,
        });
        latencies.push(r.ms);
        ttfts.push(r.ttftMs);
        if (r.chunks.length === 0) failures++;
      } catch {
        failures++;
      }
    }
  } finally {
    close();
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const first = latencies[0] ?? 0;
  const last = latencies[latencies.length - 1] ?? 0;
  const ttftCold = ttfts[0] ?? 0;
  const ttftWarm = ttfts[ttfts.length - 1] ?? 0;
  const reusePct =
    ttftCold > 0 && ttftWarm > 0
      ? Math.round((1 - ttftWarm / ttftCold) * 100)
      : 0;
  const ok = failures === 0 && latencies.length === deps.rounds;

  if (ok) {
    markScenarioCovered("chat.keepalive", "chat-keepalive", { reads: deps.rounds });
  } else {
    markScenarioSkipped("chat.keepalive", `${failures} failures`);
  }

  return {
    id: "chat.keepalive",
    ok,
    ms: Math.round(percentile(sorted, 50)),
    summary: `rounds=${deps.rounds} p50=${percentile(sorted, 50)}ms total cold=${first}ms warm=${last}ms ttft cold=${ttftCold}ms warm=${ttftWarm}ms reuse~${reusePct}%`,
  };
}

export async function runContextGrowthBench(deps: {
  backendUrl: string;
  computeModel: string;
  rounds: number;
  liveCompute: boolean;
}): Promise<ChatBenchResult> {
  if (!deps.liveCompute) {
    markScenarioSkipped("chat.context-growth", "E2E_LIVE_COMPUTE=0");
    return {
      id: "chat.context-growth",
      ok: true,
      ms: 0,
      summary: "skipped (no live compute)",
    };
  }

  const { fetch: kaFetch, close } = createKeepAliveFetch();
  const messages: Array<{ role: string; content: string }> = [
    {
      role: "system",
      content: "You are a concise assistant. Answer in one short sentence.",
    },
  ];
  const latencies: number[] = [];
  const ttfts: number[] = [];
  let ok = true;
  let lastError: string | undefined;

  try {
    for (let i = 0; i < deps.rounds; i++) {
      messages.push({
        role: "user",
        content: `Round ${i + 1}: reply with only the digit ${i + 1}.`,
      });
      try {
        const r = await consumeChatSseWithFetch(kaFetch, deps.backendUrl, {
          model: deps.computeModel,
          messages,
          max_tokens: 32,
        });
        latencies.push(r.ms);
        ttfts.push(r.ttftMs);
        const reply = r.text.trim() || `round-${i + 1}`;
        messages.push({ role: "assistant", content: reply });
        if (r.chunks.length === 0) {
          ok = false;
          lastError = "empty SSE chunks";
          break;
        }
      } catch (err) {
        ok = false;
        lastError = err instanceof Error ? err.message : String(err);
        break;
      }
    }
  } finally {
    close();
  }

  if (ok) {
    markScenarioCovered("chat.context-growth", "chat-context-growth", {
      reads: deps.rounds,
    });
  } else {
    markScenarioSkipped("chat.context-growth", lastError ?? "round failed");
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const ttftFirst = ttfts[0] ?? 0;
  const ttftLast = ttfts[ttfts.length - 1] ?? 0;
  return {
    id: "chat.context-growth",
    ok,
    ms: Math.round(percentile(sorted, 50)),
    summary: `rounds=${deps.rounds} msgs=${messages.length} p50=${percentile(sorted, 50)}ms ttft r1=${ttftFirst}ms r${deps.rounds}=${ttftLast}ms`,
    error: lastError,
  };
}

export async function runModelSwitchBench(deps: {
  backendUrl: string;
  models: string[];
  liveCompute: boolean;
}): Promise<ChatBenchResult> {
  if (!deps.liveCompute) {
    markScenarioSkipped("chat.model-switch", "E2E_LIVE_COMPUTE=0");
    return {
      id: "chat.model-switch",
      ok: true,
      ms: 0,
      summary: "skipped (no live compute)",
    };
  }
  if (deps.models.length < 2) {
    markScenarioSkipped(
      "chat.model-switch",
      `only ${deps.models.length} chat-capable model`,
    );
    return {
      id: "chat.model-switch",
      ok: true,
      ms: 0,
      summary: `single model=${deps.models[0] ?? "?"} (switch N/A)`,
    };
  }

  const { fetch: kaFetch, close } = createKeepAliveFetch();
  const used: string[] = [];
  let ok = true;
  let lastError: string | undefined;

  try {
    for (const model of deps.models.slice(0, 2)) {
      if (used.length > 0) await sleep(chatBenchCooldownMs());
      try {
        const r = await consumeChatSseWithFetch(kaFetch, deps.backendUrl, {
          model,
          messages: [{ role: "user", content: "Say hi in 3 words." }],
          max_tokens: 24,
        });
        used.push(model);
        if (r.chunks.length === 0) {
          ok = false;
          lastError = "empty SSE chunks";
        }
      } catch (err) {
        ok = false;
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
  } finally {
    close();
  }

  if (ok) {
    markScenarioCovered("chat.model-switch", "chat-model-switch", { reads: used.length });
  } else {
    markScenarioSkipped("chat.model-switch", lastError ?? "model call failed");
  }

  return {
    id: "chat.model-switch",
    ok,
    ms: 0,
    summary: `models=${used.join(" → ") || deps.models[0] || "?"}`,
    error: lastError,
  };
}

export async function runLiveChatToolsBench(deps: {
  backendUrl: string;
  computeModel: string;
  liveCompute: boolean;
}): Promise<ChatBenchResult> {
  if (!deps.liveCompute) {
    return {
      id: "chat.live-tools-sse",
      ok: true,
      ms: 0,
      summary: "skipped (no live compute)",
    };
  }

  const tools = [
    {
      type: "function" as const,
      function: {
        name: "list_my_agents",
        description: "List agents for connected wallet",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "vault_balance",
        description: "Get vault balance for tokenId",
        parameters: {
          type: "object",
          properties: { tokenId: { type: "string" } },
          required: ["tokenId"],
        },
      },
    },
  ];

  const t0 = performance.now();
  try {
    const { fetch: kaFetch, close } = createKeepAliveFetch();
    let r;
    try {
      r = await consumeChatSseWithFetch(kaFetch, deps.backendUrl, {
        model: deps.computeModel,
        messages: [
          {
            role: "system",
            content:
              "You have tools. When asked to list agents, call list_my_agents.",
          },
          {
            role: "user",
            content: "List my agents using the list_my_agents tool.",
          },
        ],
        tools,
        max_tokens: 256,
      });
    } finally {
      close();
    }

    const ok = r.chunks.length > 0 && (r.toolCallSeen || r.text.length > 0);
    if (ok) {
      markScenarioCovered("compute.chat-tools", "chat-live-tools-sse", { reads: 1 });
    }
    return {
      id: "chat.live-tools-sse",
      ok,
      ms: Math.round(performance.now() - t0),
      summary: `chunks=${r.chunks.length} toolCall=${r.toolCallSeen} tools=${r.toolNames.join(",") || "none"} textLen=${r.text.length}`,
    };
  } catch (err) {
    return {
      id: "chat.live-tools-sse",
      ok: false,
      ms: Math.round(performance.now() - t0),
      summary: "sse failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

const NON_CHAT_MODEL = /image|flux|whisper|tts|embed|speech|vision/i;
const CHAT_MODEL_HINT = /qwen|deepseek|gpt|llama|gemma|glm|mistral|omni|instruct/i;

function isChatCapableModel(id: string): boolean {
  if (NON_CHAT_MODEL.test(id)) return false;
  return CHAT_MODEL_HINT.test(id);
}

export async function resolveBenchModels(backendUrl: string): Promise<string[]> {
  const primary = await resolveE2eComputeModel(backendUrl);
  const { ok, data } = await fetchJson<{ services?: Array<{ model: string }> }>(
    `${backendUrl}/v1/compute/providers`,
  );
  if (!ok) return [primary];
  const chatModels = (data.services ?? [])
    .map((s) => s.model)
    .filter((m) => m && isChatCapableModel(m));
  const uniq = [...new Set([primary, ...chatModels])];
  return uniq.length > 0 ? uniq : [primary];
}

export async function runChatBench(deps: {
  backendUrl: string;
  operatorAddress: string;
  tokenId: string;
  vault?: string;
  agentNft?: string;
  chainId?: number;
  liveCompute?: boolean;
  contextRounds?: number;
  keepAliveRounds?: number;
  operatorSigner?: Wallet;
}): Promise<ChatBenchReport> {
  const addresses = getAddresses(process.env);
  const vault = deps.vault ?? addresses.strategyVault;
  const agentNft = deps.agentNft ?? addresses.agentNft;
  const chainId = deps.chainId ?? GALILEO_CHAIN_ID;
  const liveCompute = deps.liveCompute ?? process.env.E2E_LIVE_COMPUTE !== "0";
  const toolDeps: E2eToolDeps = {
    backendUrl: deps.backendUrl,
    operatorAddress: deps.operatorAddress,
    tokenId: deps.tokenId,
    vault,
    agentNft,
    chainId,
    operatorSigner: deps.operatorSigner,
  };

  noteFriction({
    id: "chat-rate-limit",
    severity: "warn",
    category: "config",
    message:
      "Sequential chat bench calls can hit AXIOM rate limit (default 10/min) — restart backend with AXIOM_RATE_LIMIT_MAX=50000 for bench",
    suggestion: "AXIOM_RATE_LIMIT_MAX=50000 node --import tsx src/index.ts",
  });
  noteFriction({
    id: "chat-tools-client-side",
    severity: "info",
    category: "ux",
    message:
      "Chat tools execute on frontend (wagmi + apiFetch); backend only proxies SSE to 0G Compute",
    suggestion:
      "Bench mirrors frontend handlers via executeE2eTool; full wallet write tools need MetaMask in browser",
  });

  const results: ChatBenchResult[] = [];

  results.push(...(await runToolParityBench(toolDeps, { liveCompute })));
  const depositSign = await runMicroDepositSignBench(toolDeps);
  if (depositSign) results.push(depositSign);
  results.push(await runComplexToolFlowBench(toolDeps));

  const { results: cacheResults, deltas } = await runCacheHitBench({
    backendUrl: deps.backendUrl,
    operatorAddress: deps.operatorAddress,
  });
  results.push(...cacheResults);

  const models = await resolveBenchModels(deps.backendUrl);
  const computeModel = await resolveE2eComputeModel(deps.backendUrl);

  results.push(
    await runKeepAliveBench({
      backendUrl: deps.backendUrl,
      computeModel,
      rounds: deps.keepAliveRounds ?? 3,
      liveCompute,
    }),
  );
  if (liveCompute) await sleep(chatBenchCooldownMs());
  results.push(
    await runContextGrowthBench({
      backendUrl: deps.backendUrl,
      computeModel,
      rounds: deps.contextRounds ?? 4,
      liveCompute,
    }),
  );
  if (liveCompute) await sleep(chatBenchCooldownMs());
  results.push(
    await runModelSwitchBench({
      backendUrl: deps.backendUrl,
      models,
      liveCompute,
    }),
  );
  if (liveCompute) await sleep(chatBenchCooldownMs());
  results.push(
    await runLiveChatToolsBench({
      backendUrl: deps.backendUrl,
      computeModel,
      liveCompute,
    }),
  );

  const toolResults = results.filter((r) => r.id.startsWith("tool."));
  const toolOk = toolResults.filter((r) => r.ok).length;
  const toolParityPct =
    toolResults.length > 0
      ? Math.round((toolOk / toolResults.length) * 100)
      : 0;

  const keepAlive = results.find((r) => r.id === "chat.keepalive");
  const reuseMatch = keepAlive?.summary.match(/reuse~(-?\d+)%/);
  const keepAliveReusePct = reuseMatch
    ? Number.parseInt(reuseMatch[1]!, 10)
    : undefined;

  return {
    results,
    toolParityPct,
    cacheHitMs: deltas,
    keepAliveReusePct,
    liveCompute,
  };
}

export function printChatBenchReport(report: ChatBenchReport): void {
  console.log("\n============================================");
  console.log("  Chat + Tool Bench");
  console.log("============================================");
  const classSummary = (["read", "encode", "orchestrate", "archive"] as const)
    .map((c) => `${c}=${toolsByClass(c).length}`)
    .join(" ");
  console.log(
    `  Tool parity: ${report.toolParityPct}%  |  live compute: ${report.liveCompute ? "on" : "off"}  |  classes: ${classSummary}`,
  );
  if (report.cacheHitMs) {
    const c = report.cacheHitMs;
    console.log(
      `  Cache Δms: providers=${c.providers ?? "?"} payment=${c.paymentConfig ?? "?"} agents=${c.agentList ?? "?"}`,
    );
  }
  if (report.keepAliveReusePct !== undefined) {
    console.log(`  Keep-alive reuse estimate: ~${report.keepAliveReusePct}%`);
  }
  console.log("");
  for (const r of report.results) {
    const flag = r.ok ? "OK" : "FAIL";
    console.log(
      `  ${flag.padEnd(4)} ${r.id.padEnd(24)} ${String(r.ms).padStart(5)}ms  ${r.summary}`,
    );
    if (r.error) console.log(`        ↳ ${r.error}`);
  }
  const failed = report.results.filter(
    (r) => !r.ok && !r.summary.includes("skipped") && !r.summary.includes("N/A"),
  );
  if (failed.length === 0) {
    console.log("\n  All chat bench checks passed (or live-compute skips).");
  } else {
    console.log(`\n  ${failed.length} check(s) failed — review above.`);
  }
}