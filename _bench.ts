/**
 * Chat Runtime Microbenchmarks
 *
 * Measures:
 *   (a) Tool resolution time for 100 random tool names
 *   (b) Executor dispatch overhead (finding the right executor)
 *   (c) format.ts string formatting throughput at 10k iterations
 *
 * Run: node --import tsx /tmp/axiom-bench-chat/executor-bench.ts
 */

// ── Setup: import actual modules ──────────────────────────────────────────
import { getChatToolSpec, CHAT_TOOL_CATALOG } from "@axiom/config/chat-tools";
import { runTool } from "@axiom/chat-runtime";
import { formatToolResult } from "@axiom/chat-runtime";
import type { ToolRuntime } from "@axiom/chat-runtime";
import type { ChatToolName } from "@axiom/config/chat-tools";

const ALL_TOOL_NAMES = CHAT_TOOL_CATALOG.map((t) => t.name);
const WARMUP = 10;
const ITERS_TOOL_RESOLVE = 100;
const ITERS_DISPATCH = 50;
const ITERS_FORMAT = 10_000;

// ── Mock context ──────────────────────────────────────────────────────────
const mockCtx: ToolRuntime = {
  http: {
    fetch: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
      json: async () => ({ ok: true }),
    }),
  },
  chain: {
    chainId: 1,
    readContract: async () => 0n,
    multicall: async () => [],
  },
  session: {
    chainId: 1,
    walletAddress: "0xdead000000000000000000000000000000000001" as `0x${string}`,
    lastTokenId: "42",
    lastToolName: "vault_balance" as ChatToolName,
    backendUrl: "http://localhost:8787",
    addresses: {
      vault: "0xV0000000000000000000000000000000000000V" as `0x${string}`,
      agentNft: "0xN0000000000000000000000000000000000000N" as `0x${string}`,
    },
  },
  mode: "encode-only",
  oracleUrl: "http://oracle:8787",
};

// ── Mock responses for tools that would make HTTP calls ───────────────────
// We override fetch per-bench to avoid side effects
function makeSafeCtx(overrides?: Partial<ToolRuntime>): ToolRuntime {
  return {
    ...mockCtx,
    http: {
      fetch: async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true, agents: [], events: [], count: 0, snapshots: [] }),
        json: async () => ({ ok: true, agents: [], events: [], count: 0, snapshots: [] }),
      }),
    },
    ...overrides,
  };
}

async function measure<T>(label: string, fn: () => Promise<T>, iterations: number): Promise<number> {
  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    await fn();
  }

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await fn();
  }
  const elapsed = performance.now() - start;
  const avg = elapsed / iterations;
  const ops = (1000 / avg).toFixed(1);
  console.log(`  ${label}: ${avg.toFixed(3)} ms/op (${ops} ops/sec, n=${iterations})`);
  return avg;
}

async function benchToolResolution() {
  console.log("\n── (a) Tool Resolution (getChatToolSpec) ──");

  const names = ALL_TOOL_NAMES;
  // Add some invalid names to test the miss path
  const mixedNames = [...names, "nonexistent_tool_1", "nonexistent_tool_2"];

  await measure("getChatToolSpec (valid names)", async () => {
    for (const name of names) {
      getChatToolSpec(name);
    }
  }, ITERS_TOOL_RESOLVE);

  await measure("getChatToolSpec (mixed valid+invalid)", async () => {
    for (const name of mixedNames) {
      getChatToolSpec(name);
    }
  }, ITERS_TOOL_RESOLVE);
}

async function benchExecutorDispatch() {
  console.log("\n── (b) Executor Dispatch Overhead ──");

  // Measure runTool dispatch for each tool class
  const dispatchCases = [
    { name: "read dispatch (vault_balance)", tool: "vault_balance", args: { tokenId: "42" } },
    { name: "encode dispatch (mint_agent)", tool: "mint_agent", args: { dataDescription: "test" }, ctx: makeSafeCtx({ mode: "encode-only" }) },
    { name: "orchestrate dispatch (simulate_tick)", tool: "simulate_tick", args: { tokenId: "42" } },
    { name: "archive dispatch (archive_lookup)", tool: "archive_lookup", args: { url: "https://example.com" } },
    { name: "ask dispatch (ask_user)", tool: "ask_user", args: { question: "Proceed?" } },
    { name: "skill dispatch (stocks_quote)", tool: "stocks_quote", args: { symbol: "AAPL" } },
    { name: "unknown tool (miss path)", tool: "no_such_tool", args: {} },
  ];

  for (const { name, tool, args, ctx } of dispatchCases) {
    const safeCtx = ctx ?? makeSafeCtx();
    await measure(name, async () => {
      await runTool(tool, args, safeCtx);
    }, ITERS_DISPATCH);
  }
}

async function benchFormat() {
  console.log("\n── (c) formatToolResult Formatting Throughput ──");

  const testCases: Array<{ name: string; tool: string; result: unknown }> = [
    {
      name: "encode-only calldata",
      tool: "deposit",
      result: JSON.stringify({ ok: true, encodeOnly: true, to: "0x1", data: "0xabc", value: "1000", amount: "1.5" }),
    },
    {
      name: "transaction hash (ok+txHash)",
      tool: "mint_agent",
      result: JSON.stringify({ ok: true, txHash: "0xdeadbeef" }),
    },
    {
      name: "vault balance",
      tool: "vault_balance",
      result: JSON.stringify({ balance: "1500000000000000000" }),
    },
    {
      name: "archive confirm",
      tool: "archive_confirm_deletion",
      result: JSON.stringify({ wasArchived: true, snapshotUrl: "https://web.archive.org/web/2020/example", archivedAt: "2020-01-01" }),
    },
    {
      name: "skill result (object)",
      tool: "stocks_quote",
      result: JSON.stringify({ symbol: "AAPL", price: 150, currency: "USD" }),
    },
    {
      name: "skill array result",
      tool: "evm_multichain",
      result: JSON.stringify({ balances: Array.from({ length: 10 }, (_, i) => ({ chain: `chain-${i}`, wei: String(i) })) }),
    },
    {
      name: "agents list (10 agents)",
      tool: "list_my_agents",
      result: JSON.stringify({ agents: Array.from({ length: 10 }, (_, i) => ({ tokenId: String(i + 1), dataDescription: `Agent ${i + 1}` })) }),
    },
    {
      name: "error result",
      tool: "any_tool",
      result: JSON.stringify({ error: "Something went wrong" }),
    },
  ];

  for (const { name, tool, result } of testCases) {
    await measure(`formatToolResult: ${name}`, async () => {
      formatToolResult(tool, result);
    }, ITERS_FORMAT);
  }
}

async function benchFormatMixed() {
  console.log("\n── (c-cont) formatToolResult: mixed realistic workload ──");

  // Realistic mixed sequence: various tool results that might appear in a session
  const mixedResults: Array<{ tool: string; result: string }> = [];
  const rng = () => Math.random();

  for (let i = 0; i < 100; i++) {
    const r = rng();
    if (r < 0.2) {
      mixedResults.push({ tool: "list_my_agents", result: JSON.stringify({ agents: [{ tokenId: "1" }, { tokenId: "2" }] }) });
    } else if (r < 0.35) {
      mixedResults.push({ tool: "vault_balance", result: JSON.stringify({ balance: "5000000000000000000" }) });
    } else if (r < 0.5) {
      mixedResults.push({ tool: "deposit", result: JSON.stringify({ ok: true, txHash: "0x" + "a".repeat(40) }) });
    } else if (r < 0.65) {
      mixedResults.push({ tool: "archive_lookup", result: JSON.stringify({ snapshots: [{ snapshotUrl: "https://archive.org/1", iso: "2024-01-01" }] }) });
    } else if (r < 0.8) {
      mixedResults.push({ tool: "stocks_quote", result: JSON.stringify({ symbol: "AAPL", price: 150 + i, currency: "USD" }) });
    } else {
      mixedResults.push({ tool: "ask_user", result: JSON.stringify({ ask: true, question: "Proceed?", options: ["Yes", "No"] }) });
    }
  }

  await measure("formatToolResult: mixed sequence (100 patterns)", async () => {
    for (const { tool, result } of mixedResults) {
      formatToolResult(tool, result);
    }
  }, 100); // 100 iterations = 10,000 calls each
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Axiom Chat Runtime Microbenchmarks ===");
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Node: ${process.version}`);
  console.log(`All tool names: ${ALL_TOOL_NAMES.length}`);

  await benchToolResolution();
  await benchExecutorDispatch();
  await benchFormat();
  await benchFormatMixed();

  console.log("\n=== Done ===");
}

main().catch(console.error);
