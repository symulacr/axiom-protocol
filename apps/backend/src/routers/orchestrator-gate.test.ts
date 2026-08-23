import assert from "node:assert/strict";
import { test } from "bun:test";
import { isE2eMockTickAllowed } from "./orchestrator.js";

test("e2e inference-skip tick sources are gated behind env opt-in + server principal", () => {
  // Normal and real-inference e2e-live sources are never gated.
  for (const source of [
    undefined,
    "manual:user",
    "orchestrator",
    "manual:e2e-live",
  ]) {
    assert.equal(
      isE2eMockTickAllowed(source, "client", undefined),
      true,
      `source=${String(source)} must be allowed`,
    );
  }

  const skipSources = [
    "manual:e2e",
    "manual:e2e-mock",
    "manual:e2e-availability",
  ];
  for (const source of skipSources) {
    // Default deployment (no flag): denied for every principal.
    assert.equal(isE2eMockTickAllowed(source, "client", undefined), false);
    assert.equal(isE2eMockTickAllowed(source, "server", undefined), false);
    // Flag set but caller is a client key: still denied.
    assert.equal(isE2eMockTickAllowed(source, "client", "1"), false);
    // Flag set + server key: allowed (dev/test harness only).
    assert.equal(isE2eMockTickAllowed(source, "server", "1"), true);
    // Any flag value other than exactly "1" counts as unset.
    assert.equal(isE2eMockTickAllowed(source, "server", "true"), false);
    assert.equal(isE2eMockTickAllowed(source, "server", "0"), false);
  }
});
