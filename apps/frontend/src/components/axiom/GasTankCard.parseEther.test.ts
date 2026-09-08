import { test } from "bun:test";
import assert from "node:assert/strict";
import { parseEther } from "viem";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Unit tests for tryParseEther (F1 H1). GasTankCard.tsx transitively imports
// abi/addresses.ts, which hard-requires deployed-address env vars at module
// scope, so preset harmless dummies before the dynamic import. This file is
// listed LAST in the package.json test script so the env/module cache never
// leaks into other test files.
process.env.VITE_STRATEGY_VAULT_ADDRESS ??=
  "0x0000000000000000000000000000000000000001";
process.env.VITE_AGENT_NFT_ADDRESS ??=
  "0x0000000000000000000000000000000000000002";
process.env.VITE_TEE_VERIFIER_ADDRESS ??=
  "0x0000000000000000000000000000000000000003";
process.env.VITE_PAYMENT_PROCESSOR_ADDRESS ??=
  "0x0000000000000000000000000000000000000004";
const { tryParseEther } = await import("./GasTankCard.js");

test("tryParseEther parses valid decimal input to wei", () => {
  assert.equal(tryParseEther("1"), parseEther("1"));
  assert.equal(tryParseEther("0.01"), 10_000_000_000_000_000n);
  assert.equal(tryParseEther("2.5"), parseEther("2.5"));
});

test("tryParseEther handles edge values without throwing", () => {
  assert.equal(tryParseEther("0"), 0n);
  assert.equal(tryParseEther("0.000000000000000001"), 1n); // 1 wei
});

test("tryParseEther returns null for malformed input instead of throwing", () => {
  assert.equal(tryParseEther("abc"), null);
  assert.equal(tryParseEther("1.2.3"), null);
  assert.equal(tryParseEther(""), null);
});

test("deposit CTA gate safe-parses — no bare parseEther on raw user input", () => {
  const src = readFileSync(join(import.meta.dir, "GasTankCard.tsx"), "utf8");
  assert.ok(
    !src.includes('parseEther(depositValue || "0")'),
    "render-time parseEther on raw depositValue is gone",
  );
  assert.ok(src.includes("const depositWei = tryParseEther(depositValue);"));
  // invalid (null) or below-min input keeps the CTA disabled
  assert.ok(src.includes("depositWei === null ||"));
  assert.ok(src.includes("depositWei < parseEther(minDeposit)"));
});
