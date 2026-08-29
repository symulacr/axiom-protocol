import { test, describe } from "bun:test";
import assert from "node:assert/strict";
import { backendEnvSchema } from "./env-schema.js";

// Minimal base satisfying required fields (AXIOM_TEE_SIGNER_PK, DEPLOYER_PK,
// AXIOM_EVM_RPC) so each case only exercises the knob under test.
const base = {
  AXIOM_TEE_SIGNER_PK: "0x" + "11".repeat(32),
  DEPLOYER_PK: "0x" + "22".repeat(32),
  AXIOM_EVM_RPC: "https://evmrpc-testnet.0g.ai",
};

describe("backendEnvSchema ad-hoc knobs (W0-9)", () => {
  test("defaults hold when vars unset", () => {
    const env = backendEnvSchema.parse({ ...base });
    assert.equal(env.AXIOM_AGENT_LIST_CACHE_MS, 120_000);
    assert.equal(env.AXIOM_HEALTH_CACHE_MS, 3_000);
    assert.equal(env.AXIOM_MAX_PROOF_AGE_SECONDS, 604_800);
  });

  test("valid values parse (string coercion from process.env)", () => {
    const env = backendEnvSchema.parse({
      ...base,
      AXIOM_AGENT_LIST_CACHE_MS: "5000",
      AXIOM_HEALTH_CACHE_MS: "1000",
      AXIOM_MAX_PROOF_AGE_SECONDS: "86400",
    });
    assert.equal(env.AXIOM_AGENT_LIST_CACHE_MS, 5000);
    assert.equal(env.AXIOM_HEALTH_CACHE_MS, 1000);
    assert.equal(env.AXIOM_MAX_PROOF_AGE_SECONDS, 86400);
  });

  test("negative/garbage values rejected", () => {
    for (const [key, value] of [
      ["AXIOM_AGENT_LIST_CACHE_MS", "-1"],
      ["AXIOM_HEALTH_CACHE_MS", "zero"],
      ["AXIOM_MAX_PROOF_AGE_SECONDS", "0"],
    ] as const) {
      const result = backendEnvSchema.safeParse({ ...base, [key]: value });
      assert.notEqual(result.success, true, `${key}=${value} must be rejected`);
    }
  });
});

describe("AXIOM_DEK_CUSTODY (sealed-DEK custody flag, ADR-004 §2.4)", () => {
  test("defaults to false when unset — prod-off per spec", () => {
    const env = backendEnvSchema.parse({ ...base });
    assert.equal(env.AXIOM_DEK_CUSTODY, "false");
  });

  test("accepts explicit true/false", () => {
    for (const value of ["true", "false"] as const) {
      const env = backendEnvSchema.parse({ ...base, AXIOM_DEK_CUSTODY: value });
      assert.equal(env.AXIOM_DEK_CUSTODY, value);
    }
  });

  test("rejects values outside the true/false enum", () => {
    for (const value of ["1", "yes", "TRUE", "on", ""]) {
      const result = backendEnvSchema.safeParse({
        ...base,
        AXIOM_DEK_CUSTODY: value,
      });
      assert.notEqual(
        result.success,
        true,
        `AXIOM_DEK_CUSTODY=${value} must be rejected`,
      );
    }
  });
});
