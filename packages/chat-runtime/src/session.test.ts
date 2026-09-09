import { test, describe, it } from "bun:test";
import assert from "node:assert/strict";
import {
  summarizeConversation,
  pinSummary,
  applyToolResult,
  createSession,
  groupParallelTools,
  detectPlan,
  matchPlan,
  snapHistoryStart,
  fitToContext,
} from "./session.js";

const mk = (role: string, content: string) => ({ role, content });

test("summarizeConversation returns empty for an empty prefix", () => {
  assert.equal(summarizeConversation([]), "");
});

test("summarizeConversation summarizes exactly the passed prefix", () => {
  const summary = summarizeConversation([
    mk("user", "first turn"),
    mk("assistant", "first reply"),
  ]);
  assert.match(summary, /\[user\] first turn/);
  assert.match(summary, /\[assistant\] first reply/);
});

describe("pinSummary (cache-stable prefix)", () => {
  const turns = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      mk("user", `turn ${i} ` + "x".repeat(30)),
    );

  it("computes on first cut and reuses while the dropped prefix stays within 2x", () => {
    const first = pinSummary(undefined, turns(10));
    assert.ok(first.summary.length > 0);
    assert.equal(first.covered, 10);
    const grown = pinSummary(first, turns(20)); // 20 <= 2*10: reuse
    assert.equal(grown.summary, first.summary);
    assert.equal(grown.covered, 10);
    const shrunk = pinSummary(first, turns(5)); // smaller drop: still reuse
    assert.equal(shrunk.summary, first.summary);
  });

  it("regenerates only when the uncovered prefix more than doubles", () => {
    const first = pinSummary(undefined, turns(10));
    const regen = pinSummary(first, turns(21)); // 21 > 2*10: regenerate
    assert.equal(regen.covered, 21);
    assert.notEqual(regen.summary, first.summary);
    assert.match(regen.summary, /turn 10/);
  });
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

  it("maps 'set strategy' onto the set_strategy catalog tool and keeps exact names", () => {
    assert.deepEqual(matchPlan(["deposit", "set strategy", "execute_tick"]), [
      "deposit",
      "set_strategy",
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

// Live incident 2026-09-08: a front-cut (fitToContext drop, formerly also the
// compactHistory window and ChatPage's 50-message cap) landing inside a tool
// block produced a payload whose first message had role "tool" — the provider
// rejects it with 400 "Messages with role 'tool' must be a response to a
// preceding message with 'tool_calls'", surfaced to users as a fake compute
// outage. fitToContext is now the only cut, and it snaps via snapHistoryStart.
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

// 2026-09-09 context-fit redesign (user directive: "context side, like 80% of
// the 1M context"): fitToContext is the only cut. RECENT_KEEP=6 is a floor,
// never a target; the count cap exists only as backend-schema legality.
describe("token-budget authority", () => {
  const small = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      mk(i % 2 ? "assistant" : "user", `m${i}`),
    );

  it("keeps more than RECENT_KEEP when the token budget allows", () => {
    const out = fitToContext(small(20) as never, {
      model: "deepseek-v4-flash",
      system: "s",
      contextWindow: 1_000_000,
    });
    assert.equal(out.length, 20);
  });

  it("drops to the RECENT_KEEP floor when the budget is exhausted, never below", () => {
    const big = Array.from({ length: 30 }, (_, i) =>
      mk(i % 2 ? "assistant" : "user", "x".repeat(4000)),
    );
    const out = fitToContext(big as never, {
      model: "m",
      system: "s",
      contextWindow: 1000, // budget negative after reserves: drop to the floor
      outputReserve: 100,
      recentKeep: 6,
    });
    assert.equal(out.length, 6);
  });

  it("budget = floor(0.8*window) - reserve - safety - overhead", () => {
    // window 100k, reserve 10k, overhead 2 tokens ("s" + "[]"):
    // budget = 80000 - 10000 - 1024 - 2 = 68974 tokens ≈ 275,896 chars.
    const fits = Array.from({ length: 13 }, (_, i) =>
      mk(i % 2 ? "assistant" : "user", "x".repeat(20_000)),
    );
    const kept = fitToContext(fits as never, {
      model: "m",
      system: "s",
      contextWindow: 100_000,
      outputReserve: 10_000,
    });
    assert.equal(kept.length, 13, "260k chars fits the 69k-token budget");
    const overflows = [...fits, mk("user", "x".repeat(20_000))];
    const cut = fitToContext(overflows as never, {
      model: "m",
      system: "s",
      contextWindow: 100_000,
      outputReserve: 10_000,
    });
    assert.ok(
      cut.length < 14 && cut.length >= 6,
      `280k chars exceeds the budget, cut to ${cut.length}`,
    );
  });

  it("uses the catalog max_completion_tokens as the default output reserve", () => {
    // deepseek-v4-flash catalog: reserve 39,321 (vs the 4096 fallback). A
    // history that fits under 4096 but not under 39321 is cut only when the
    // catalog reserve applies.
    const msgs = Array.from({ length: 8 }, (_, i) =>
      mk(i % 2 ? "assistant" : "user", "x".repeat(390_000)),
    );
    const catalog = fitToContext(msgs as never, {
      model: "deepseek-v4-flash",
      system: "s",
      contextWindow: 1_000_000,
    });
    const fallback = fitToContext(msgs as never, {
      model: "deepseek-v4-flash",
      system: "s",
      contextWindow: 1_000_000,
      outputReserve: 4096,
    });
    assert.equal(fallback.length, 8, "fits with the 4096 reserve");
    assert.ok(catalog.length < 8, "cut with the 39321 catalog reserve");
  });

  it("never exceeds the backend byte ceiling even when the catalog window does (transport legality)", () => {
    // The backend's old max(50) message cap is a ~4MB byte guard now (≈1M
    // tokens at len/4): a 10M-window catalog must not inflate the payload
    // past MAX_PAYLOAD_TOKENS minus reserves and overhead.
    const huge = Array.from({ length: 40 }, (_, i) =>
      mk(i % 2 ? "assistant" : "user", "x".repeat(200_000)),
    ); // 8M chars ≈ 2M tokens
    const out = fitToContext(huge as never, {
      model: "deepseek-v4-flash",
      system: "s",
      contextWindow: 10_000_000,
    });
    const estimated = Math.ceil(JSON.stringify(out).length / 4);
    assert.ok(
      estimated <= 1_000_000 - 39_321 - 1024,
      `payload estimate ${estimated} exceeds the byte ceiling minus reserves`,
    );
    assert.ok(out.length >= 6, "RECENT_KEEP floor still holds");
    assert.notEqual(out[0]!.role, "tool");
  });

  it("a long but light history is count-free: 60 small messages all fit", () => {
    const out = fitToContext(small(60) as never, {
      model: "deepseek-v4-flash",
      system: "s",
      contextWindow: 1_000_000,
    });
    assert.equal(out.length, 60, "no message-count cap remains");
  });
});
