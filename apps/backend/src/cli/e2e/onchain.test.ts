import { test } from "bun:test";
import assert from "node:assert/strict";
import { recordReceipt } from "./onchain.js";
import { stepResults } from "./http.js";





test("recordReceipt records an ok on-chain step with explorer url", () => {
  const before = stepResults.length;
  recordReceipt(
    5,
    "AxiomStrategyVault.deposit",
    "balance 0 -> 100",
    { hash: "0xabc123", blockNumber: 42 },
    1,
  );
  assert.equal(stepResults.length, before + 1);
  const entry = stepResults[stepResults.length - 1]!;
  assert.equal(entry.step, 5);
  assert.equal(entry.name, "AxiomStrategyVault.deposit");
  assert.equal(entry.ok, true);
  assert.equal(entry.summary, "balance 0 -> 100");
  assert.equal(entry.txHash, "0xabc123");
  assert.equal(entry.blockNumber, 42);
  assert.match(entry.explorerUrl ?? "", /\/tx\/0xabc123$/);
});

test("recordReceipt derives explorer url from chainId", () => {
  const before = stepResults.length;
  recordReceipt(6, "x", "y", { hash: "0xdeadbeef", blockNumber: 7 }, 42161);
  const entry = stepResults[stepResults.length - 1]!;
  assert.match(entry.explorerUrl ?? "", /\/tx\/0xdeadbeef$/);
  assert.equal(stepResults.length, before + 1);
});
