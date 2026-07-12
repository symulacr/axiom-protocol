import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAskUserPrompt, runAskTool, isAskUserResult } from "./ask.js";
import { formatToolResult } from "../format.js";

test("buildAskUserPrompt returns a selectable prompt with capped options", () => {
  const p = buildAskUserPrompt({
    question: "Which chain?",
    options: ["Galileo", "Aristotle", "Testnet", "Mainnet", "Extra"],
    multiSelect: false,
  });
  assert.equal(p.question, "Which chain?");
  assert.equal(p.selectable, true);
  assert.equal(p.multiSelect, false);
  assert.deepEqual(p.options, ["Galileo", "Aristotle", "Testnet", "Mainnet"]);
});

test("buildAskUserPrompt throws when question is missing", () => {
  assert.throws(() => buildAskUserPrompt({}), /question/);
});

test("runAskTool returns ok with ask flag and performs no I/O", async () => {
  const r = await runAskTool(
    "ask_user",
    { question: "Continue?", options: ["yes", "no"] },
    {} as never,
  );
  assert.equal(r.ok, true);
  const obj = JSON.parse(r.content) as Record<string, unknown>;
  assert.equal(obj.ask, true);
  assert.equal(obj.question, "Continue?");
});

test("isAskUserResult detects ask payloads only", () => {
  assert.equal(
    isAskUserResult({ ok: true, content: JSON.stringify({ ask: true, question: "q" }) }),
    true,
  );
  assert.equal(isAskUserResult({ ok: false, content: "{}" }), false);
  assert.equal(isAskUserResult({ ok: true, content: "{}" }), false);
});

test("formatToolResult renders an ask result as a readable question", () => {
  const content = JSON.stringify({ ask: true, question: "Pick one", options: ["a", "b"] });
  const text = formatToolResult("ask_user", content);
  assert.match(text, /Ask user: Pick one/);
  assert.match(text, /1\. a/);
});
