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

  it("mandates autonomous step chaining, no permission pauses (J2 continuity)", () => {
    assert.match(prompt, /CONTINUITY/);
    assert.match(
      prompt,
      /mint → fund \(deposit\) → set strategy → run tick → pay/,
    );
    assert.match(prompt, /IMMEDIATELY call the next tool/);
    assert.match(prompt, /unless a tool FAILED/);
  });

  it("names what it is waiting on (wallet vs chain) instead of shrugging (J2 waiting-state)", () => {
    assert.match(prompt, /WAITING-STATE AWARENESS/);
    assert.match(prompt, /Waiting for wallet confirmation…/);
    assert.match(prompt, /Submitted, waiting for chain confirmation…/);
    assert.match(prompt, /Never describe a wait as 'I don't know what to do'/);
  });

  it("'next'/'continue' resumes the pending step from session memory (J2 session state)", () => {
    assert.match(prompt, /SESSION STATE/);
    assert.match(prompt, /lastTokenId/);
    assert.match(
      prompt,
      /'next', 'continue', 'go on'[\s\S]*?EXECUTE THE NEXT PENDING STEP/,
    );
  });

  it("executes approved numbered plans in order, one tool per step (J2 plan tracking)", () => {
    assert.match(prompt, /PLAN TRACKING/);
    assert.match(prompt, /execute items IN ORDER, one tool call per step/);
    assert.match(prompt, /until the plan completes or a step fails/);
  });
});
