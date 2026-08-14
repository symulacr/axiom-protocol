import { describe, it } from "bun:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "./prompt.js";

describe("buildSystemPrompt", () => {
  const prompt = buildSystemPrompt();

  it("lists tool classes with guidance (F-11 slim)", () => {
    assert.match(prompt, /Tool classes/);
    assert.match(prompt, /ENCODE — .*wallet-signs/i);
    assert.match(prompt, /ASK — .*ask the user/i);
  });

  it("includes requiresWallet skill names in the on-chain list", () => {
    assert.match(prompt, /On-chain \/ wallet actions \([^)]*evm_tx/);
  });

  it("includes execute_tick in the on-chain list (F-20)", () => {
    assert.match(prompt, /On-chain \/ wallet actions \([^)]*execute_tick/);
  });

  it("identifies as Axiom, not a vendor model name", () => {
    assert.match(prompt, /You are Axiom/);
    assert.doesNotMatch(prompt, /You are (DeepSeek|GPT|Claude)/i);
  });

  it("does not claim all EVM skills read 8 chains", () => {
    assert.doesNotMatch(prompt, /8 chains/);
    // exact specs now ride the tools API param; prompt keeps class guidance only
    assert.match(prompt, /READ — read on-chain state/i);
  });

  it("is byte-stable — no wallet/tokenId/timestamp leak (prefix-cache anchor)", () => {
    assert.doesNotMatch(
      prompt,
      /wallet:|default tokenId|0x[0-9a-fA-F]{40}|20\d\d-\d\d-\d\d|timestamp/i,
    );
    // repeated builds are byte-identical (no session, no clock)
    assert.equal(buildSystemPrompt(), prompt);
  });
});
