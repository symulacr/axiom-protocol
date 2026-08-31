import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Faucet FE surface (V3 W6-B): GasTankCard faucet row states + the hook's
// claim transport. Runtime hooks need a wagmi Provider — these assert the
// source contract instead (repo convention: guard tests).

test("GasTankCard renders the faucet row with balance + eligibility badge", () => {
  const src = readFileSync(
    join(import.meta.dir, "../components/axiom/GasTankCard.tsx"),
    "utf8",
  );
  assert.ok(src.includes("gas-tank-card__faucet"));
  assert.ok(src.includes("useFaucet(address)"));
  assert.ok(src.includes("faucet.eligible"));
  // Eligible state comes first with the claim CTA; the ineligible badge is the fallback.
  assert.ok(
    src.indexOf("faucetEligibleBadge") < src.indexOf("faucetIneligibleBadge"),
  );
  assert.ok(src.includes("faucet.claim()"));
});

test("faucet claim goes through POST /v1/relayer/faucet/:address (no user signature)", () => {
  const src = readFileSync(join(import.meta.dir, "./useFaucet.ts"), "utf8");
  assert.ok(src.includes("`/v1/relayer/faucet/${address}`"));
  assert.ok(src.includes('method: "POST"'));
  // The claim never signs typed data — mint is permissionless.
  assert.ok(!src.includes("signTypedData"));
  // The response flips the badge off.
  assert.ok(src.includes("setEligible(false)"));
});

test("faucet hook reads the live USDC balance with 6 decimals", () => {
  const src = readFileSync(join(import.meta.dir, "./useFaucet.ts"), "utf8");
  assert.ok(src.includes("formatUnits(raw, USDC_DECIMALS)"));
  assert.ok(src.includes("USDC_DECIMALS = 6"));
});

test("faucet copy strings exist in en/fr/de", () => {
  const src = readFileSync(join(import.meta.dir, "../lib/copy.ts"), "utf8");
  for (const key of [
    "faucetBalanceLabel",
    "faucetEligibleBadge",
    "faucetIneligibleBadge",
    "faucetClaimAction",
  ]) {
    const count = src.split(key).length - 1;
    // 1x type declaration + 3 locales (en + fr/de spreads need their own override text)
    assert.ok(
      count >= 4,
      `${key} expected in type + 3 locales, found ${count}`,
    );
  }
});
