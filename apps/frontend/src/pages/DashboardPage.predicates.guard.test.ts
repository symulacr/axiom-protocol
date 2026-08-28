/*
  T1/T2 predicate regression guards (Wave-H1 executor C):
  - T1 checklist steps self-check from existing state (FirstRunChecklist
    exports: firstRunSteps / hasCompletedTick / hasFundedVault).
  - T2 attention split (DashboardPage): fresh agents are "unconfigured"
    (never trouble); only vault readError / funded-without-strategy-root
    count as "failing". Structural regex guards follow the
    ChatPage.guard.test.ts convention (source regex on DashboardPage).
*/
import { describe, expect, test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  firstRunSteps,
  hasCompletedTick,
  hasFundedVault,
} from "../components/axiom/FirstRunChecklist.js";
import { hasStrategyRoot } from "../lib/models.js";
import type { AppState } from "../lib/models.js";
import type { VaultDataEntry } from "../hooks/useVaultDataBatch.js";

const dashboardSrc = readFileSync(
  join(import.meta.dir, "DashboardPage.tsx"),
  "utf8",
);

const tx = (
  overrides: Partial<AppState["transactions"][number]>,
): AppState["transactions"][number] =>
  ({
    id: "tx-1",
    kind: "tick",
    detail: "",
    hash: "0x0",
    age: "",
    state: "confirmed",
    route: "/tick",
    agent: "#1",
    icon: null,
    ...overrides,
  }) as AppState["transactions"][number];

const vault = (overrides: Partial<VaultDataEntry>): VaultDataEntry =>
  ({
    tokenId: 1n,
    depositsWei: 0n,
    strategyRoot: `0x${"ab".repeat(32)}`,
    dailyLimitWei: 0n,
    dailySpentWei: 0n,
    resetDay: 0n,
    validUntilDay: 0n,
    ...overrides,
  }) as VaultDataEntry;

describe("T1 first-run checklist predicates", () => {
  test("step-checks true when agents exist, a vault is funded, a tick receipt confirmed", () => {
    const { done, allDone } = firstRunSteps({
      hasAgent: true,
      hasFundedVault: true,
      hasTickReceipt: true,
    });
    assert.deepEqual(done, [true, true, true]);
    assert.ok(allDone);
  });

  test("fresh wallet: every step open, card must not claim completion", () => {
    const { done, allDone } = firstRunSteps({
      hasAgent: false,
      hasFundedVault: false,
      hasTickReceipt: false,
    });
    assert.deepEqual(done, [false, false, false]);
    assert.ok(!allDone);
  });

  test("hasFundedVault keys on depositsWei, not on a bare vault row", () => {
    const funded = new Map<string, VaultDataEntry>([
      ["1", vault({ depositsWei: 5n })],
    ]);
    const empty = new Map<string, VaultDataEntry>([
      ["1", vault({ depositsWei: 0n })],
    ]);
    assert.ok(hasFundedVault(funded));
    assert.ok(!hasFundedVault(empty));
    assert.ok(!hasFundedVault(new Map()));
  });

  test("hasCompletedTick requires route /tick AND confirmed state", () => {
    assert.ok(hasCompletedTick([tx({ route: "/tick", state: "confirmed" })]));
    // Reverted/abandoned attempts are not a completed first run.
    assert.ok(!hasCompletedTick([tx({ route: "/tick", state: "reverted" })]));
    // A confirmed receipt on another flow does not complete the tick step.
    assert.ok(!hasCompletedTick([tx({ route: "/mint", state: "confirmed" })]));
  });
});

describe("T2 attention split predicates (unconfigured vs failing)", () => {
  test("hasStrategyRoot: zero root means never bound, non-zero root means bound", () => {
    assert.ok(!hasStrategyRoot(null));
    assert.ok(
      !hasStrategyRoot(
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      ),
    );
    assert.ok(hasStrategyRoot(`0x${"ab".repeat(32)}`));
  });

  test("DashboardPage splits agents into unconfigured + failing (no merged attention array)", () => {
    // T2 contract: two buckets, named exactly unconfigured/failing.
    assert.match(dashboardSrc, /const \{ unconfigured, failing \} = useMemo/);
    // The old merged predicate must be gone — it warned about fresh agents.
    assert.doesNotMatch(dashboardSrc, /const attention = /);
  });

  test("failing bucket covers vault readError and funded-without-root; everything else is unconfigured", () => {
    // Read error → fault.
    assert.match(
      dashboardSrc,
      /if \(vault\?\.readError\) failing\.push\(agent\);/,
    );
    // Funded but strategy root never bound → fault (not a fresh-agent state).
    assert.match(dashboardSrc, /depositsWei > 0n &&\s*\n\s*!hasStrategyRoot\(/);
    // Default branch is the neutral bucket.
    assert.match(dashboardSrc, /else unconfigured\.push\(agent\);/);
  });

  test("action-lane counts failing only — review(count) never driven by unconfigured", () => {
    // T2: the action lane derives its count from the failing bucket…
    assert.match(dashboardSrc, /review\(failing\.length\)/);
    // …and the old merged attention array is gone everywhere.
    assert.doesNotMatch(dashboardSrc, /review\(attention\.length\)/);
  });
});
