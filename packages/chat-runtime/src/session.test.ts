import { test, describe, it } from "bun:test";
import assert from "node:assert/strict";
import {
  summarizeConversation,
  compactHistory,
  applyToolResult,
  createSession,
  groupParallelTools,
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
