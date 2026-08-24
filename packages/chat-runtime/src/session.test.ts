import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  summarizeConversation,
  evaluateContinue,
  compactHistory,
  MAX_TOOL_LOOPS,
  applyToolResult,
  createSession,
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

test("evaluateContinue is false below budget and structured above", () => {
  assert.deepEqual(evaluateContinue(3), { exhausted: false, signal: null });
  const over = evaluateContinue(MAX_TOOL_LOOPS);
  assert.equal(over.exhausted, true);
  assert.deepEqual(over.signal, {
    type: "continue",
    reason: "tool_loop_budget_exceeded",
  });
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
