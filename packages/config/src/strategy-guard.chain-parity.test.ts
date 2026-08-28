/**
 * M9 / ADR-004 §1.3: strategy-invariant parity proof between the TypeScript
 * pre-send mirror (strategy-guard.ts) and AxiomStrategyVault.execute().
 * The same invariant was hand-maintained in two languages; this test pins the
 * mirror against the .sol source structurally (revert order, exact conditions)
 * and behaviorally (decision table), so drift fails CI instead of burning
 * reverting txs at runtime.
 *
 * Structural checks follow the repo's established source-pinning pattern
 * (cf. orchestrator-tick-guard.test.ts, ChatPage.guard.test.ts).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "bun:test";
import { strategyGuardError } from "./strategy-guard.js";

const GUARD_SRC = readFileSync(
  join(import.meta.dir, "strategy-guard.ts"),
  "utf8",
);
const VAULT_SRC = readFileSync(
  join(
    import.meta.dir,
    "..",
    "..",
    "..",
    "apps",
    "contracts",
    "src",
    "AxiomStrategyVault.sol",
  ),
  "utf8",
);

/** Isolate the execute() body so checks can't match other functions' reverts. */
const executeBody = (() => {
  const start = VAULT_SRC.indexOf("function execute(");
  assert.notEqual(start, -1, "execute() missing from AxiomStrategyVault.sol");
  const end = VAULT_SRC.indexOf("\n    function ", start + 1);
  return VAULT_SRC.slice(start, end === -1 ? undefined : end);
})();

const SOL_ORDER = [
  "revert NoStrategySet()",
  "if (value > balance) revert ZeroAmount()",
  "if (target == address(0)) revert ZeroAddress()",
  "revert StrategyExpired()",
  "if (today != v.resetDay)",
  "revert DailyLimitExceeded()",
];

function solOrderIndexes(): number[] {
  return SOL_ORDER.map((snippet) => {
    const idx = executeBody.indexOf(snippet);
    assert.notEqual(idx, -1, `execute() lost snippet: ${snippet}`);
    return idx;
  });
}

// Fixed "today": day index 20000.
const TODAY = 20_000n;
const base = {
  dailyLimitWei: 10n,
  dailySpentWei: 0n,
  resetDay: TODAY,
  validUntilDay: 0n,
};

describe("chain parity: Solidity revert-order contract", () => {
  test("execute() checks fire in the documented first-match-wins order", () => {
    const idx = solOrderIndexes();
    for (let i = 1; i < idx.length; i++) {
      assert.ok(
        idx[i] > idx[i - 1],
        `${SOL_ORDER[i]} must come after ${SOL_ORDER[i - 1]}`,
      );
    }
  });

  test("expiry is gated on the 0n no-expiry sentinel and inclusive of the final day", () => {
    assert.match(
      executeBody,
      /if \(v\.validUntilDay != 0 && today > v\.validUntilDay\) revert StrategyExpired\(\);/,
      "0n sentinel + strict today > validUntilDay (final day still valid)",
    );
  });

  test("rollover reset triggers on ANY day change, not just forward days", () => {
    assert.match(
      executeBody,
      /if \(today != v\.resetDay\) \{\s*v\.dailySpent = 0;\s*v\.resetDay = today;/,
      "today != resetDay (covers clock-behind skew), not today > resetDay",
    );
  });

  test("daily limit has NO zero-limit bypass — limit 0 blocks every spend", () => {
    assert.doesNotMatch(
      executeBody,
      /dailyLimit\s*>\s*0/,
      "a `dailyLimit > 0` sentinel must not sneak back into the contract",
    );
    assert.match(
      executeBody,
      /uint256\(v\.dailySpent\) \+ uint256\(spend\) > uint256\(v\.dailyLimit\)\) revert DailyLimitExceeded\(\);/,
      "strict-greater check against the raw limit, zero included",
    );
  });

  test("balance insufficiency reverts ZeroAmount before any strategy checks", () => {
    const balanceIdx = executeBody.indexOf(
      "if (value > balance) revert ZeroAmount()",
    );
    const expiryIdx = executeBody.indexOf("revert StrategyExpired()");
    assert.ok(balanceIdx < expiryIdx, "balance check precedes expiry");
  });
});

describe("chain parity: TS mirror agrees with the Solidity decision table", () => {
  test("order: StrategyExpired wins over DailyLimitExceeded (first-match-wins)", () => {
    const err = strategyGuardError(
      { ...base, dailySpentWei: 6n, validUntilDay: TODAY - 1n },
      5n,
      TODAY,
    );
    assert.match(err ?? "", /^Strategy expired/);
    // Mirror side pins its own internal order too.
    assert.ok(
      GUARD_SRC.indexOf("validUntilDay") < GUARD_SRC.indexOf("dailyLimitWei)"),
      "guard checks expiry before the limit",
    );
  });

  test("expired: today > validUntilDay blocked, final day inclusive, 0n = no expiry", () => {
    assert.match(
      strategyGuardError({ ...base, validUntilDay: TODAY - 1n }, 1n, TODAY) ??
        "",
      /^Strategy expired/,
    );
    assert.equal(
      strategyGuardError({ ...base, validUntilDay: TODAY }, 1n, TODAY),
      null,
    );
    assert.equal(
      strategyGuardError({ ...base, validUntilDay: 0n }, 1n, TODAY + 999n),
      null,
    );
  });

  test("rollover boundary: spent resets once today differs from resetDay (both directions)", () => {
    // Day advanced: full budget available again.
    assert.equal(
      strategyGuardError({ ...base, dailySpentWei: 10n }, 10n, TODAY + 1n),
      null,
    );
    // Local clock behind chain resetDay (skew): contract resets, mirror must too.
    assert.equal(
      strategyGuardError(
        { ...base, dailySpentWei: 10n, resetDay: TODAY + 1n },
        10n,
        TODAY,
      ),
      null,
    );
    // Same day: budget still consumed.
    assert.match(
      strategyGuardError({ ...base, dailySpentWei: 10n }, 1n, TODAY) ?? "",
      /^Daily limit exceeded/,
    );
  });

  test("daily limit: boundary spend+value == limit allowed, one wei over blocked", () => {
    assert.equal(
      strategyGuardError({ ...base, dailySpentWei: 6n }, 4n, TODAY),
      null,
    );
    assert.match(
      strategyGuardError({ ...base, dailySpentWei: 6n }, 5n, TODAY) ?? "",
      /^Daily limit exceeded/,
    );
  });

  test("dailyLimit=0 blocks (no unlimited sentinel) — the drift this test caught", () => {
    // Chain: dailySpent + spend > 0 for any value>0 → DailyLimitExceeded.
    assert.match(
      strategyGuardError({ ...base, dailyLimitWei: 0n }, 1n, TODAY) ?? "",
      /^Daily limit exceeded/,
    );
    // value=0 against limit=0: chain computes 0 + 0 > 0 → false → proceeds.
    assert.equal(
      strategyGuardError({ ...base, dailyLimitWei: 0n }, 0n, TODAY),
      null,
    );
  });

  test("dimensions the guard intentionally does not mirror (no tuple input)", () => {
    // NoStrategySet: checked upstream by the orchestrator before the guard.
    // Balance insufficiency + ZeroAddress: wallet/plan-side facts, not part
    // of the strategyOf tuple the mirror consumes.
    const limitsShape =
      GUARD_SRC.match(/export type StrategyLimits = \{[\s\S]*?\};/)?.[0] ?? "";
    assert.doesNotMatch(limitsShape, /strategyRoot|balance|target/);
    // But the .sol still owns those checks, in order, ahead of expiry:
    assert.ok(
      executeBody.indexOf("revert NoStrategySet()") <
        executeBody.indexOf("if (value > balance) revert ZeroAmount()"),
    );
  });

  test("limit-overflow (uint128 cap) is enforced at the API boundary, not the guard", () => {
    // execute() reverts LimitOverflow for value > type(uint128).max; the
    // backend route schema rejects such plans pre-send, so the guard's
    // arithmetic can rely on uint128-bounded inputs. Not asserted here —
    // documented division of responsibility (route-schemas.ts).
    assert.match(
      executeBody,
      /if \(value > type\(uint128\)\.max\) revert LimitOverflow\(\);/,
    );
  });
});
