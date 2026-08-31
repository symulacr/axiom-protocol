import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { humanizeError } from "../utils/format.js";
import { tankResponseShape } from "./gasTank.helpers.js";

// GasTank FE surface (V3 W5-B): card states, humanized tank errors, and the
// browser transport's sponsor builder. Runtime hooks need a wagmi Provider —
// these assert the contract-facing shapes instead (convention: guard tests).

test("humanizeError maps tank-exhausted to the two remedies", () => {
  const out = humanizeError(
    new Error("gas tank exhausted — grants cap reached for this address"),
  );
  assert.match(out, /free gas grants are used up/);
  assert.match(out, /GasTank UI/);
  assert.match(out, /connect a wallet/);
});

test("humanizeError maps reserve exhaustion to the operator-side remedy", () => {
  const out = humanizeError(new Error("protocol gas reserve exhausted"));
  assert.match(out, /reserve is temporarily empty/);
  assert.match(out, /try again shortly/);
});

test("humanizeError maps the sponsor rate limit to a wait", () => {
  const out = humanizeError(
    new Error("sponsor rate limit exceeded — retry shortly"),
  );
  assert.match(out, /Too many sponsored ops/);
});

test("GasTankCard renders the disabled-when-unset state", () => {
  const src = readFileSync(
    join(import.meta.dir, "../components/axiom/GasTankCard.tsx"),
    "utf8",
  );
  assert.ok(src.includes("getAxiomGasTankAddress()"));
  assert.ok(src.includes("gas-tank-card--unset"));
  // the unset branch precedes any RPC-dependent render
  const unsetIdx = src.indexOf("if (unset)");
  const balanceIdx = src.indexOf("tank.balance");
  assert.ok(unsetIdx > 0 && balanceIdx > unsetIdx);
});

test("GasTankCard refill is gated on an empty tank + remaining grants", () => {
  const src = readFileSync(
    join(import.meta.dir, "../components/axiom/GasTankCard.tsx"),
    "utf8",
  );
  assert.ok(src.includes("tank.balance > 0n || tank.grantsLeft === 0n"));
});

test("GasTankCard deposit enforces the 0.01 minimum", () => {
  const src = readFileSync(
    join(import.meta.dir, "../components/axiom/GasTankCard.tsx"),
    "utf8",
  );
  const minDeposit = 'const minDeposit = "0.01";';
  assert.ok(src.includes(minDeposit));
  assert.ok(
    src.includes('parseEther(depositValue || "0") < parseEther(minDeposit)'),
  );
});

test("transport-browser wires the sponsor capability via signTypedDataAsync + GasTank domain", () => {
  const src = readFileSync(
    join(import.meta.dir, "../chat/transport-browser.ts"),
    "utf8",
  );
  assert.ok(src.includes("GAS_TANK_DOMAIN_NAME"));
  assert.ok(src.includes("GAS_TANK_FORWARD_REQUEST_TYPES"));
  assert.ok(src.includes('primaryType: "ForwardRequest"'));
  assert.ok(src.includes("getAxiomGasTankAddress(chainId)"));
  // signature-only contract: the capability never submits the POST itself
  assert.ok(src.includes("return { signature }"));
});

test("chat tools.ts carries the optional sponsor capability on ToolContext", () => {
  const src = readFileSync(join(import.meta.dir, "../chat/tools.ts"), "utf8");
  assert.ok(src.includes("signTypedDataAsync"));
});

test("tank status shape derives opsLeft + sponsored from live reads", () => {
  const status = tankResponseShape({
    balance: 20_000_000_000_000_000n,
    grantsUsed: 1n,
    grantsCap: 3n,
    gasGrant: 10_000_000_000_000_000n,
  });
  assert.equal(status.opsLeft, 2);
  assert.equal(status.sponsored, true);
  assert.equal(status.grantsLeft, 2n);

  const empty = tankResponseShape({
    balance: 0n,
    grantsUsed: 3n,
    grantsCap: 3n,
    gasGrant: 10_000_000_000_000_000n,
  });
  assert.equal(empty.opsLeft, 0);
  assert.equal(empty.sponsored, false);
});
