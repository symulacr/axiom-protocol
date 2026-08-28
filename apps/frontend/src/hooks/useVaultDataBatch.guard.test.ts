/**
 * M9: strategyOf tuple fields must feed a predictive guard that blocks
 * operations BEFORE the wallet signs into a guaranteed DailyLimitExceeded /
 * StrategyExpired revert — same UTC-day rollover math as the contract.
 */
import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import {
  currentUtcDay,
  strategyGuardError,
  utcDayDateLabel,
} from "@axiom/config";

const DAY_MS = 86_400_000;
// Fixed "today": day index 20000 → 2024-10-04 UTC.
const TODAY = 20_000n;

const base = {
  dailyLimitWei: 10n,
  dailySpentWei: 0n,
  resetDay: TODAY,
  validUntilDay: 0n,
};

describe("currentUtcDay", () => {
  test("matches the contract's block.timestamp / 1 days math", () => {
    assert.equal(currentUtcDay(Number(TODAY) * DAY_MS), TODAY);
    assert.equal(currentUtcDay(Number(TODAY) * DAY_MS + DAY_MS - 1), TODAY);
  });
});

describe("utcDayDateLabel", () => {
  test("formats a day index as its UTC calendar date", () => {
    assert.equal(utcDayDateLabel(0n), "1970-01-01");
    assert.equal(
      utcDayDateLabel(TODAY),
      new Date(Number(TODAY) * DAY_MS).toISOString().slice(0, 10),
    );
  });
});

describe("strategyGuardError", () => {
  test("allows an operation inside the daily budget", () => {
    assert.equal(
      strategyGuardError({ ...base, dailySpentWei: 6n }, 4n, TODAY),
      null,
    );
  });

  test("blocks early when the operation would exceed the daily limit", () => {
    const err = strategyGuardError({ ...base, dailySpentWei: 6n }, 5n, TODAY);
    assert.match(err ?? "", /Daily limit exceeded/);
    assert.match(err ?? "", /resets 2024-10-05/);
  });

  test("spend counter resets once today passes resetDay (contract rollover)", () => {
    assert.equal(
      strategyGuardError({ ...base, dailySpentWei: 10n }, 10n, TODAY + 1n),
      null,
    );
  });

  test("blocks when the daily limit is 0 — no unlimited sentinel (contract: DailyLimitExceeded)", () => {
    assert.match(
      strategyGuardError(
        { ...base, dailyLimitWei: 0n, dailySpentWei: 999n },
        1_000_000n,
        TODAY,
      ) ?? "",
      /Daily limit exceeded/,
    );
  });

  test("blocks after validUntilDay has passed", () => {
    const err = strategyGuardError(
      { ...base, validUntilDay: TODAY - 1n },
      1n,
      TODAY,
    );
    assert.match(err ?? "", /Strategy expired/);
  });

  test("expiry is inclusive of the final valid day", () => {
    assert.equal(
      strategyGuardError({ ...base, validUntilDay: TODAY }, 1n, TODAY),
      null,
    );
  });

  test("validUntilDay 0n means no expiry", () => {
    assert.equal(
      strategyGuardError({ ...base, validUntilDay: 0n }, 1n, TODAY + 999n),
      null,
    );
  });

  test("expiry takes precedence over the limit check (contract order)", () => {
    const err = strategyGuardError(
      { ...base, dailySpentWei: 6n, validUntilDay: TODAY - 1n },
      5n,
      TODAY,
    );
    assert.match(err ?? "", /Strategy expired/);
  });
});
