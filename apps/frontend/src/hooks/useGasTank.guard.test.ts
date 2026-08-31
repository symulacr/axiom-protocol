import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Convention: useProviders.test.ts — source-shape guards for hook wiring that
// needs a wagmi Provider at runtime. These pin the contract-facing invariants.

const src = readFileSync(join(import.meta.dir, "useGasTank.ts"), "utf8");

test("reads balanceOf + grantsUsed + grantsCap + gasGrant in ONE aggregateReads batch", () => {
  assert.ok(src.includes("aggregateReads(publicClient, ["));
  // exactly one batch: the four reads collapse into a single Multicall3 round-trip
  const callBlocks = src.split("functionName:").length - 1;
  assert.equal(callBlocks, 4);
});

test("reads the LIVE gasGrant — never hardcodes 0.01e18 (admin-tunable)", () => {
  assert.ok(src.includes('functionName: "gasGrant"'));
  assert.ok(!src.includes("10000000000000000n"));
  assert.ok(!src.includes("0.01e18"));
});

test("env-gated: unset gasTank address → no RPC and null tank (wallet-less first-run)", () => {
  assert.ok(src.includes("getAxiomGasTankAddress()"));
  // early return before aggregateReads when unset
  assert.ok(src.includes("if (!gasTank || !address || !publicClient)"));
});

test("sponsored predicate: balance > 0 OR grants left (lazy grant)", () => {
  assert.ok(src.includes("balance > 0n || grantsLeft > 0n"));
});
