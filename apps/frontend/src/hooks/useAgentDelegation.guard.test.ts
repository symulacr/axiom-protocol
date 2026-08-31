import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Convention: useProviders.test.ts — source-shape guards for hook wiring that
// needs a wagmi Provider at runtime.

const src = readFileSync(
  join(import.meta.dir, "useAgentDelegation.ts"),
  "utf8",
);

test("reads getDelegation + isDelegationActive in ONE aggregateReads batch", () => {
  assert.ok(src.includes('"getDelegation"'));
  assert.ok(src.includes('"isDelegationActive"'));
  assert.ok(src.includes("aggregateReads(publicClient, ["));
});

test("tuple destructure order matches AxiomDelegationRegistry.AgentDelegation", () => {
  assert.ok(
    src.includes(
      "[agentTokenId, delegate, perTxCap, windowCap, windowSeconds, expiresAt, allowedSelectorsRoot, nonce]",
    ),
  );
});

test("registry address is env-gated and surfaced as isConfigured", () => {
  assert.ok(src.includes("getAxiomDelegationRegistryAddress()"));
  assert.ok(src.includes("isConfigured: registry !== undefined"));
});

test("revocation surface read: active flag collapses registry + expiry", () => {
  assert.ok(src.includes("isDelegationActive:"));
});
