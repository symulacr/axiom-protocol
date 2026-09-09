import { describe, it } from "bun:test";
import assert from "node:assert/strict";
import { buildSystemPrompt, buildRemainingPlanBlock } from "./prompt.js";

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
      /mint → fund \(deposit\) → set strategy \(set_strategy\) → run tick → pay/,
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

  it("documents the GAS-TANK sponsored lane as the 5th rule after PLAN TRACKING (V3 W5-B)", () => {
    // Order pin: GAS-TANK comes immediately after PLAN TRACKING.
    const planIdx = prompt.indexOf("PLAN TRACKING —");
    const gasIdx = prompt.indexOf("GAS-TANK —");
    assert.ok(planIdx >= 0, "PLAN TRACKING rule present");
    assert.ok(gasIdx > planIdx, "GAS-TANK rule after PLAN TRACKING");
    const body = prompt.slice(planIdx, gasIdx);
    // Rule blocks join with \n\n — exactly one separator between the two rules.
    assert.equal(
      body.match(/\n\n/g)?.length,
      1,
      "GAS-TANK is the very next rule block",
    );
    assert.match(
      prompt,
      /withdraw, pay_for_agent, swap_tokens, borrow normally run GAS-FREE/,
    );
    assert.match(prompt, /gas tank is exhausted/);
    assert.match(prompt, /GasTank UI/);
    assert.match(prompt, /gas_tank_status/);
  });

  it("confirm-first list covers signers, not wallet-gated reads", () => {
    const list = prompt.match(/On-chain \/ wallet actions \(([^)]*)\)/);
    assert.ok(list, "confirm-first list present");
    for (const signer of [
      "mint_agent",
      "deposit",
      "withdraw",
      "transfer",
      "execute_tick",
      "evm_tx",
    ]) {
      assert.ok(list[1]!.includes(signer), `${signer} listed`);
    }
    for (const read of ["list_my_agents", "gas_tank_status", "faucet_status"]) {
      assert.ok(
        !list[1]!.includes(read),
        `${read} is a read — not confirm-first`,
      );
    }
  });

  it("missing-parameter stops route to ask_user, not a NEED: text protocol", () => {
    assert.doesNotMatch(prompt, /NEED:/);
    assert.match(prompt, /STOP and call ask_user/);
  });

  it("has a tool-error recovery rule (read, fix, retry at most once)", () => {
    assert.match(prompt, /TOOL ERRORS/);
    assert.match(prompt, /retry at most once/);
    assert.match(prompt, /never report a failed action as done/i);
  });

  it("waiting-state strings are examples, rendered in the user's language", () => {
    assert.match(prompt, /Use the user's language/);
  });
});

describe("buildRemainingPlanBlock (hidden plan reminder)", () => {
  it("returns null when no plan is active, so no block is injected", () => {
    assert.equal(buildRemainingPlanBlock([]), null);
  });

  it("carries only the remaining steps, numbered one per line", () => {
    const block = buildRemainingPlanBlock(["deposit", "simulate_tick"]);
    assert.ok(block);
    assert.match(block!, /^REMAINING PLAN/);
    assert.match(block!, /\n1\. deposit\n2\. simulate_tick$/);
  });

  it("shrinks as steps complete and never repeats a completed step", () => {
    const full = buildRemainingPlanBlock([
      "mint_agent",
      "deposit",
      "set_strategy",
    ])!;
    const after = buildRemainingPlanBlock(["deposit", "set_strategy"])!;
    assert.match(
      after,
      /^REMAINING PLAN[\s\S]*\n1\. deposit\n2\. set_strategy$/,
    );
    assert.ok(!after.includes("mint_agent"), "completed step drops out");
    assert.ok(after.length < full.length);
  });

  it("never duplicates the stable prompt (prefix-cache separation)", () => {
    const prompt = buildSystemPrompt();
    const block = buildRemainingPlanBlock(["deposit"])!;
    assert.ok(
      !prompt.includes(block),
      "block is not part of the stable prompt",
    );
    assert.ok(
      !block.includes("CONTINUITY"),
      "block carries no stable-prompt rules",
    );
    // The stable prompt itself stays byte-identical with or without a plan.
    assert.equal(buildSystemPrompt(), prompt);
  });
});
