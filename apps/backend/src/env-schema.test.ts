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

describe("backendEnvSchema relayer block (V3 W5-B)", () => {
  test("mode defaults to off; knobs default when unset", () => {
    const env = backendEnvSchema.parse({ ...base });
    assert.equal(env.AXIOM_RELAYER_MODE, "off");
    assert.equal(env.AXIOM_RELAYER_BATCH_MAX, 64);
    assert.equal(env.AXIOM_RELAYER_RECONCILE_INTERVAL_MS, 60_000);
    assert.equal(env.AXIOM_RELAYER_SPONSOR_RATE_PER_MIN, 6);
    assert.equal(
      env.AXIOM_RELAYER_SPONSOR_MAX_GAS_COST_WEI,
      1_000_000_000_000_000n,
    );
    assert.equal(env.AXIOM_RELAYER_SPONSOR_MAX_INFLIGHT_PER_USER, 2);
  });

  test("AXIOM_RELAYER_MODE accepts on/off only", () => {
    assert.equal(
      backendEnvSchema.safeParse({ ...base, AXIOM_RELAYER_MODE: "on" }).success,
      true,
    );
    assert.equal(
      backendEnvSchema.safeParse({ ...base, AXIOM_RELAYER_MODE: "always" })
        .success,
      false,
    );
  });

  test("BATCH_MAX capped at 64; garbage rejected", () => {
    assert.equal(
      backendEnvSchema.safeParse({ ...base, AXIOM_RELAYER_BATCH_MAX: "64" })
        .success,
      true,
    );
    assert.equal(
      backendEnvSchema.safeParse({ ...base, AXIOM_RELAYER_BATCH_MAX: "65" })
        .success,
      false,
    );
    assert.equal(
      backendEnvSchema.safeParse({ ...base, AXIOM_RELAYER_BATCH_MAX: "zero" })
        .success,
      false,
    );
  });

  test("sponsor ceiling coerces to bigint; zero/negative rejected", () => {
    const ok = backendEnvSchema.safeParse({
      ...base,
      AXIOM_RELAYER_SPONSOR_MAX_GAS_COST_WEI: "2000000000000000",
    });
    assert.equal(ok.success, true);
    assert.equal(
      ok.success && ok.data.AXIOM_RELAYER_SPONSOR_MAX_GAS_COST_WEI,
      2_000_000_000_000_000n,
    );
    assert.equal(
      backendEnvSchema.safeParse({
        ...base,
        AXIOM_RELAYER_SPONSOR_MAX_GAS_COST_WEI: "0",
      }).success,
      false,
    );
  });

  test("GAS_TANK_ADDRESS and RELAYER_PK optional (mode-gated fail-start in server.ts)", () => {
    const env = backendEnvSchema.parse({ ...base });
    assert.equal(env.AXIOM_GAS_TANK_ADDRESS, undefined);
    assert.equal(env.AXIOM_RELAYER_PK, undefined);
    const withPk = backendEnvSchema.parse({
      ...base,
      AXIOM_RELAYER_PK: "0x" + "33".repeat(32),
    });
    assert.equal(withPk.AXIOM_RELAYER_PK, "0x" + "33".repeat(32));
  });
});
