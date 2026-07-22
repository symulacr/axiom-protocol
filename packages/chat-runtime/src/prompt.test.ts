import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "./prompt.js";

describe("buildSystemPrompt", () => {
  const session = { chainId: 1 };
  const prompt = buildSystemPrompt(session);

  it("surfaces a requiresWallet tag for wallet tools", () => {
    assert.match(prompt, /\[wallet/);
  });

  it("includes requiresWallet skill names in the on-chain list", () => {
    assert.match(prompt, /On-chain \/ wallet actions \([^)]*evm_tx/);
  });

  it("includes execute_tick in the on-chain list (F-20)", () => {
    assert.match(prompt, /On-chain \/ wallet actions \([^)]*execute_tick/);
  });

  it("surfaces capabilities metadata to the model (F-19)", () => {
    assert.match(prompt, /caps:evm,wallet/);
    assert.match(prompt, /caps:forensics,supply-chain/);
  });

  it("identifies as Axiom, not a vendor model name", () => {
    assert.match(prompt, /You are Axiom/);
    assert.doesNotMatch(prompt, /You are (DeepSeek|GPT|Claude)/i);
  });

  it("does not claim all EVM skills read 8 chains", () => {
    assert.doesNotMatch(prompt, /8 chains/);
    assert.match(prompt, /evm_multichain/);
  });
});
