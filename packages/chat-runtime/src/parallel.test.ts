import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groupParallelTools } from "./parallel.js";

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