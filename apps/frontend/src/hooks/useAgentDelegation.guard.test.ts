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
  // destructure is multiline in the hook; assert element order positionally
  const names = [
    "agentTokenId",
    "delegate",
    "perTxCap",
    "windowCap",
    "windowSeconds",
    "expiresAt",
    "allowedSelectorsRoot",
    "nonce",
  ];
  const idxs = names.map((n) => src.indexOf(`            ${n},`));
  assert.ok(
    idxs.every((i) => i > 0),
    "all tuple elements present",
  );
  assert.deepEqual(
    idxs,
    [...idxs].sort((a, b) => a - b),
    "destructure order must match the AgentDelegation tuple",
  );
});

test("registry address is env-gated and surfaced as isConfigured", () => {
  assert.ok(src.includes("getAxiomDelegationRegistryAddress()"));
  assert.ok(src.includes("isConfigured: registry !== undefined"));
});

test("revocation surface read: active flag collapses registry + expiry", () => {
  assert.ok(src.includes("isDelegationActive:"));
});
