import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summarizeConversation,
  evaluateContinue,
  shouldAutoContinue,
  compactHistory,
  MAX_TOOL_LOOPS,
} from "./session.js";

const mk = (role: string, content: string) => ({ role, content });

test("summarizeConversation returns empty for short history", () => {
  assert.equal(summarizeConversation([mk("user", "hi"), mk("assistant", "hello")]), "");
});

test("summarizeConversation returns a non-empty summary for long history", () => {
  const msgs = Array.from({ length: 10 }, (_, i) => mk(i % 2 ? "assistant" : "user", "x".repeat(50)));
  const summary = summarizeConversation(msgs);
  assert.ok(summary.length > 0);
  assert.match(summary, /\[user\]/);
});

test("evaluateContinue is false below budget and structured above", () => {
  assert.deepEqual(evaluateContinue(3), { exhausted: false, signal: null });
  const over = evaluateContinue(MAX_TOOL_LOOPS);
  assert.equal(over.exhausted, true);
  assert.deepEqual(over.signal, { type: "continue", reason: "tool_loop_budget_exceeded" });
});

test("shouldAutoContinue respects a critical request", () => {
  const signal = evaluateContinue(MAX_TOOL_LOOPS).signal;
  assert.equal(shouldAutoContinue(signal, false), true);
  assert.equal(shouldAutoContinue(signal, true), false);
  assert.equal(shouldAutoContinue(null, false), false);
});

test("compactHistory returns a summary message followed by recent turns", () => {
  const msgs = Array.from({ length: 8 }, (_, i) => mk(i % 2 ? "assistant" : "user", String(i))) as never;
  const out = compactHistory(msgs, "SUMMARY", 3);
  assert.equal(out.length, 4);
  assert.match(String((out[0] as { content: string }).content), /SUMMARY/);
});
