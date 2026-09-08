import { test, describe, it } from "bun:test";
import assert from "node:assert/strict";
import {
  summarizeConversation,
  compactHistory,
  applyToolResult,
  createSession,
  groupParallelTools,
  detectPlan,
  matchPlan,
  snapHistoryStart,
  fitToContext,
} from "./session.js";

const mk = (role: string, content: string) => ({ role, content });

test("summarizeConversation returns empty for short history", () => {
  assert.equal(
    summarizeConversation([mk("user", "hi"), mk("assistant", "hello")]),
    "",
  );
});

test("summarizeConversation returns a non-empty summary for long history", () => {
  const msgs = Array.from({ length: 10 }, (_, i) =>
    mk(i % 2 ? "assistant" : "user", "x".repeat(50)),
  );
  const summary = summarizeConversation(msgs);
  assert.ok(summary.length > 0);
  assert.match(summary, /\[user\]/);
});

test("compactHistory returns a summary message followed by recent turns", () => {
  const msgs = Array.from({ length: 8 }, (_, i) =>
    mk(i % 2 ? "assistant" : "user", String(i)),
  ) as never;
  const out = compactHistory(msgs, "SUMMARY", 3);
  assert.equal(out.length, 4);
  assert.match(String((out[0] as { content: string }).content), /SUMMARY/);
});

test("applyToolResult captures tokenId from plain body, {data} wrapper, and first-of-multi JSON", () => {
  const s = () => createSession({ chainId: 16602 });
  const base = s();
  applyToolResult(base, "agent_metadata", {
    ok: true,
    content: JSON.stringify({ tokenId: 7 }),
  });
  assert.equal(base.lastTokenId, "7");

  const wrapped = s();
  applyToolResult(wrapped, "unbroker_simulate", {
    ok: true,
    content: JSON.stringify({ truncated: false, data: { tokenId: 9 } }),
  });
  assert.equal(wrapped.lastTokenId, "9");

  const multi = s();
  applyToolResult(multi, "vault_balance", {
    ok: true,
    content:
      JSON.stringify({ tokenId: 12, balance: "1" }) +
      JSON.stringify({ tokenId: 99 }),
  });
  assert.equal(multi.lastTokenId, "12");

  const agents = s();
  applyToolResult(agents, "list_my_agents", {
    ok: true,
    content: JSON.stringify({ agents: [{ tokenId: 3 }] }),
  });
  assert.equal(agents.lastTokenId, "3");
});

describe("lastPlan continuity (J2)", () => {
  it("createSession threads lastPlan through", () => {
    const s = createSession({ chainId: 16602, lastPlan: ["mint_agent"] });
    assert.deepEqual(s.lastPlan, ["mint_agent"]);
    assert.equal(createSession({ chainId: 16602 }).lastPlan, undefined);
  });

  it("a successful plan-head call consumes it; later calls leave the rest", () => {
    const s = createSession({
      chainId: 16602,
      lastPlan: ["mint_agent", "deposit", "simulate_tick"],
    });
    applyToolResult(s, "mint_agent", {
      ok: true,
      content: JSON.stringify({ tokenId: 7 }),
    });
    assert.deepEqual(s.lastPlan, ["deposit", "simulate_tick"]);
    applyToolResult(s, "list_my_agents", {
      ok: true,
      content: JSON.stringify({ agents: [] }),
    });
    assert.deepEqual(s.lastPlan, ["deposit", "simulate_tick"]);
  });

  it("a FAILED plan-head call keeps the plan for retry", () => {
    const s = createSession({
      chainId: 16602,
      lastPlan: ["deposit", "simulate_tick"],
    });
    applyToolResult(s, "deposit", { ok: false, content: "user rejected" });
    assert.deepEqual(s.lastPlan, ["deposit", "simulate_tick"]);
  });

  it("an off-plan successful STATE-CHANGING tool clears a stale plan (model re-planned)", () => {
    const s = createSession({
      chainId: 16602,
      lastPlan: ["deposit", "simulate_tick"],
    });
    applyToolResult(s, "transfer", {
      ok: true,
      content: JSON.stringify({ ok: true }),
    });
    assert.deepEqual(s.lastPlan, []);
  });

  it("an off-plan READ does not clear the plan (interstitial reads are expected)", () => {
    const s = createSession({
      chainId: 16602,
      lastPlan: ["deposit", "simulate_tick"],
    });
    applyToolResult(s, "list_my_agents", {
      ok: true,
      content: JSON.stringify({ agents: [] }),
    });
    assert.deepEqual(s.lastPlan, ["deposit", "simulate_tick"]);
  });
});

describe("detectPlan / matchPlan (J2)", () => {
  it("extracts contiguous numbered items and stops at prose", () => {
    const text = [
      "Here is the plan:",
      "1. Mint the agent",
      "2. Deposit funds",
      "",
      "Note: gas is paid separately.",
    ].join("\n");
    assert.deepEqual(detectPlan(text), ["Mint the agent", "Deposit funds"]);
  });

  it("ignores prose without numbered items", () => {
    assert.deepEqual(detectPlan("no plan here"), []);
  });

  it("maps plan text onto real catalog tool names (mint/fund/tick flow)", () => {
    assert.deepEqual(
      matchPlan(
        detectPlan(
          "1. Mint the agent\n2. Fund the vault\n3. Run a tick\n4. Pay",
        ),
      ),
      ["mint_agent", "deposit", "simulate_tick"],
    );
  });

  it("maps 'set strategy' onto a session read (no strategy tool in catalog) and keeps exact names", () => {
    assert.deepEqual(matchPlan(["deposit", "set strategy", "execute_tick"]), [
      "deposit",
      "vault_balance",
      "execute_tick",
    ]);
  });
});

describe("groupParallelTools", () => {
  it("batches parallel-safe read tools together", () => {
    const calls = [
      { function: { name: "list_my_agents" } },
      { function: { name: "vault_balance" } },
      { function: { name: "agent_metadata" } },
    ];
    const batches = groupParallelTools(calls);
    assert.equal(batches.length, 1);
    assert.equal(batches[0]!.length, 3);
  });

  it("isolates encode tools into serial lanes", () => {
    const calls = [
      { function: { name: "vault_balance" } },
      { function: { name: "deposit" } },
      { function: { name: "archive_lookup" } },
    ];
    const batches = groupParallelTools(calls);
    assert.equal(batches.length, 3);
    assert.equal(batches[0]![0]!.function.name, "vault_balance");
    assert.equal(batches[1]![0]!.function.name, "deposit");
    assert.equal(batches[2]![0]!.function.name, "archive_lookup");
  });

  it("keeps execute_tick serial", () => {
    const calls = [
      { function: { name: "event_history" } },
      { function: { name: "execute_tick" } },
    ];
    const batches = groupParallelTools(calls);
    assert.equal(batches.length, 2);
    assert.equal(batches[1]![0]!.function.name, "execute_tick");
  });

  it("groups reads and isolates wallet tools", () => {
    const calls = [
      { function: { name: "list_my_agents" } },
      { function: { name: "vault_balance" } },
      { function: { name: "deposit" } },
      { function: { name: "agent_metadata" } },
    ];
    const batches = groupParallelTools(calls);
    assert.equal(batches.length, 3);
    assert.equal(batches[0]!.length, 2);
    assert.equal(batches[1]![0]!.function.name, "deposit");
    assert.equal(batches[2]![0]!.function.name, "agent_metadata");
  });

  it("places a requiresWallet skill tool in its own serial batch", () => {
    const calls = [
      { function: { name: "vault_balance" } },
      { function: { name: "evm_tx" } },
      { function: { name: "agent_metadata" } },
    ];
    const batches = groupParallelTools(calls);
    assert.equal(batches.length, 3);
    assert.equal(batches[1]![0]!.function.name, "evm_tx");
  });
});

// Live incident 2026-09-08: front-cuts (compactHistory window, fitToContext
// drop, ChatPage's 50-message cap) landing inside a tool block produced a
// payload whose first message had role "tool" — the provider rejects it with
// 400 "Messages with role 'tool' must be a response to a preceding message
// with 'tool_calls'", surfaced to users as a fake compute outage.
describe("tool-block-safe history cuts", () => {
  const tcAssistant = (id: string) => ({
    role: "assistant" as const,
    content: null,
    tool_calls: [
      {
        id,
        type: "function" as const,
        function: { name: "vault_balance", arguments: "{}" },
      },
    ],
  });
  const toolMsg = (id: string) => ({
    role: "tool" as const,
    content: "{}",
    tool_call_id: id,
    name: "vault_balance",
  });

  it("snapHistoryStart skips leading tool messages only", () => {
    const msgs = [
      mk("user", "u0"),
      tcAssistant("c1"),
      toolMsg("c1"),
      mk("assistant", "a2"),
      mk("user", "u3"),
    ];
    assert.equal(snapHistoryStart(msgs, 0), 0); // user start: untouched
    assert.equal(snapHistoryStart(msgs, 1), 1); // assistant w/ tool_calls: safe
    assert.equal(snapHistoryStart(msgs, 2), 3); // orphan tool: snapped forward
    assert.equal(snapHistoryStart(msgs, -4), 0); // clamped
    assert.equal(snapHistoryStart([toolMsg("c1")], 0), 1); // all-tool tail
  });

  it("compactHistory never opens the recent window on a tool message", () => {
    const msgs = [
      mk("user", "u0"),
      tcAssistant("c1"),
      toolMsg("c1"),
      mk("assistant", "a2"),
      mk("user", "u3"),
      mk("assistant", "a4"),
      mk("user", "u5"),
      mk("user", "u6"),
    ];
    const out = compactHistory(msgs as never, "SUMMARY", 6);
    assert.equal(out[0]!.role, "user"); // summary lead
    assert.match(String((out[0] as { content: string }).content), /SUMMARY/);
    assert.notEqual(out[1]!.role, "tool");
    assert.equal((out[1] as { content: string | null }).content, "a2");
  });

  it("compactHistory keeps an assistant-with-tool_calls boundary intact", () => {
    const msgs = [
      mk("user", "u0"),
      tcAssistant("c1"),
      toolMsg("c1"),
      mk("assistant", "a2"),
      mk("user", "u3"),
      mk("user", "u4"),
      mk("user", "u5"),
      mk("user", "u6"),
    ];
    const out = compactHistory(msgs as never, "SUMMARY", 7);
    assert.equal(out.length, 8); // summary + full 7-message window, no snap
    assert.deepEqual(
      (out[1] as { tool_calls?: Array<{ id: string }> }).tool_calls?.[0]?.id,
      "c1",
    );
    assert.equal(out[2]!.role, "tool"); // its result rides along
  });

  it("fitToContext never drops into the middle of a tool block", () => {
    const msgs = [
      mk("user", "u0 ".repeat(40)),
      tcAssistant("c1"),
      toolMsg("c1"),
      mk("assistant", "a2 ".repeat(40)),
      mk("user", "u3 ".repeat(40)),
      tcAssistant("c4"),
      toolMsg("c4"),
      mk("assistant", "a5"),
      mk("user", "u6"),
    ];
    const out = fitToContext(msgs as never, {
      model: "any",
      system: "s",
      contextWindow: 100, // negative budget → drop to the keep floor
      recentKeep: 3,
    });
    assert.notEqual(out[0]!.role, "tool");
    assert.deepEqual(
      out.map((m) => m.role),
      ["assistant", "user"],
    );
  });
});
