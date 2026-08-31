import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Convention: useProviders.test.ts — source-shape guards for hook wiring that
// needs a wagmi Provider at runtime. These pin the contract-facing invariants.

const src = readFileSync(
  join(import.meta.dir, "usePaymentSnapshot.ts"),
  "utf8",
);

test("paymentSnapshot is fetched through ONE aggregateReads call", () => {
  assert.ok(src.includes("aggregateReads(publicClient, ["));
  // exactly one call entry — the statefold view collapses cap/balance/allowance/token
  const callBlocks = src.split("functionName:").length - 1;
  assert.equal(callBlocks, 1);
});

test("snapshot shape matches Processor.paymentSnapshot return order (statefold)", () => {
  assert.ok(src.includes('functionName: "paymentSnapshot"'));
  // destructuring order = maxPayCap, computeRatioMax, agentBalance, payerAllowance, paymentToken
  // (format-agnostic: prettier may collapse the tuple to multi-line)
  const normalized = src.replace(/\s+/g, " ").replace(/, \]/g, " ]");
  assert.ok(
    normalized.includes(
      "[ maxPayCap, computeRatioMax, agentBalance, payerAllowance, paymentToken ]",
    ),
  );
});

test("reads target the PaymentProcessor (statefold), env-gated: no address → no RPC and null snapshot", () => {
  assert.ok(src.includes("getAxiomPaymentProcessorAddress()"));
  assert.ok(!src.includes("getAxiomStateViewAddress"));
  // early return before aggregateReads when unset
  assert.ok(src.includes("if (!processor || !address || !publicClient)"));
});

test("cap sentinel documented: 0 = unlimited", () => {
  assert.ok(src.includes("0 = unlimited"));
});
