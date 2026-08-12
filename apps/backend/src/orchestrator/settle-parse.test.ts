import { test } from "bun:test";
import assert from "node:assert/strict";
import { parseRecommendation, settlementSkipReason } from "./index.js";

const ZERO_ROOT =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

test("parseRecommendation maps 'act' action to act", () => {
  const rec = parseRecommendation('{"action":"act","reason":"go"}');
  assert.equal(rec.action, "act");
});

test("parseRecommendation falls back to hold for unknown action 'buy'", () => {
  const rec = parseRecommendation('{"action":"buy","reason":"x"}');
  assert.equal(rec.action, "hold");
});

test("parseRecommendation falls back to hold for unparseable output", () => {
  const rec = parseRecommendation("not json");
  assert.equal(rec.action, "hold");
});

test("settlementSkipReason reports no strategy set for zero root", () => {
  const reason = settlementSkipReason(ZERO_ROOT);
  assert.ok(reason.includes("no strategy set"), `reason was: ${reason}`);
});

test("settlementSkipReason reports Merkle proof producer requirement for non-zero root", () => {
  const reason = settlementSkipReason("0xabc");
  assert.ok(
    reason.includes("Merkle proof producer"),
    `reason was: ${reason}`,
  );
});
