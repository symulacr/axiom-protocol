import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Structural regression guards for the F2a medium fixes (M6/M7/M8/M10):
// the demo recovery tile must expose its inert state, the filters popover
// must not float detached on scroll/resize, the copied notice must follow a
// resolved clipboard write, and /agents/ routes must not carry dead intent
// params.
// Convention: useTransfer.dataHash.test.ts (regex on source).
const src = readFileSync(join(import.meta.dir, "TransactionsPage.tsx"), "utf8");

test("M6: demo recovery tile carries aria-disabled like the sibling chips", () => {
  const tile = src.match(
    /<button\s*\n\s*className="ops-summary-recovery"[\s\S]*?>/,
  );
  assert.ok(tile, "recovery tile button present");
  assert.match(
    tile[0],
    /aria-disabled=\{demo \|\| undefined\}/,
    "inert demo state is exposed to assistive tech",
  );
});

test("M7: open filters popover closes on scroll and resize", () => {
  assert.match(
    src,
    /if \(!filtersPos\) return;\s*\n\s*const close = \(\) => setFiltersPos\(null\);/,
    "close handler gated on the open popover",
  );
  assert.match(src, /window\.addEventListener\("scroll", close, true\)/);
  assert.match(src, /window\.addEventListener\("resize", close\)/);
  assert.match(src, /window\.removeEventListener\("scroll", close, true\)/);
  assert.match(src, /window\.removeEventListener\("resize", close\)/);
});

test("M8: copied notice fires only after a resolved clipboard write", () => {
  assert.match(
    src,
    /const clipboard = navigator\.clipboard;\s*\n\s*if \(!clipboard\?\.writeText\) return;/,
    "missing clipboard API must not raise the notice",
  );
  const write = src.indexOf("await clipboard.writeText(tx.hash);");
  const notice = src.indexOf("notice: txCopy.receiptCopied");
  assert.ok(write >= 0 && notice > write, "notice follows the resolved write");
});

test("M10: /agents/ routes go without the dead intent param", () => {
  assert.doesNotMatch(
    src,
    /\$\{tx\.route\}\?intent=/,
    "no unconditional intent suffix left",
  );
  assert.match(src, /route\.startsWith\("\/agents\/"\)/);
  assert.ok(src.includes('withIntent(tx.route, "recovery")'));
  assert.ok(src.includes('withIntent(tx.route, "receipt")'));
});

// plan-003 receipt-ticket guards: the explorer action renders exactly once
// (the header action row owns it; the Network row prints the chain readout),
// and the Agent cell prints a formatted id or the dash — never a bare 0,
// never the "chain"/"new" sentinels.
test("R3: one explorer leg — the Network row prints the chain, not a link", () => {
  const networkRow = src.match(/<dt>\{txCopy\.network\}<\/dt>[\s\S]*?<\/div>/);
  assert.ok(networkRow, "network row present");
  assert.doesNotMatch(networkRow![0], /explorerHref|viewOnExplorer/);
  assert.match(
    src,
    /interpolate\(copy\.flowUi\.networkFact, \{\s*chainName: APP_CHAIN\.name,\s*chainId: APP_CHAIN_ID,\s*\}\)/,
    "network readout interpolates the shared chain fact",
  );
});

test("R3: agent cell prints #id for real token ids (0 included), dash otherwise", () => {
  assert.match(
    src,
    /\/\^\\d\+\$\/\.test\(tx\.agent\) \? `#\$\{tx\.agent\}` : "—"/,
    "bare digits are real ids; sentinels and empty print the dash",
  );
});

// ui-audit event-history fix: blockNumber 0 rows are synthetic orchestrator
// ticks (appended by /v1/orchestrator/tick, never mined). The row must carry
// the honest off-chain label plus the real payload content, and the drawer
// must drop its explorer leg — a digest "hash" would 404 on any explorer.
import { eventToTransaction } from "./TransactionsPage";
import { getCopy } from "../lib/copy";

const txCopy = getCopy("en").transactions;

function tickEvent(
  payload: Record<string, unknown>,
  blockNumber = 0,
): Parameters<typeof eventToTransaction>[0] {
  return {
    blockNumber,
    logIndex: 0,
    txHash: `0x${"ab".repeat(32)}`,
    chainId: 16661,
    receivedAt: 0,
    eventName: "Tick",
    timestamp: Math.floor(Date.now() / 1000),
    payload,
  };
}

test("blockNumber 0 row renders the off-chain tick label with payload content", () => {
  const row = eventToTransaction(
    tickEvent({
      tokenId: "7",
      action: "act",
      amount: 250,
      reason:
        "Momentum signal crossed the entry threshold; vault balance covers the position.",
      durationMs: 1834,
    }),
    getCopy("en").time,
    txCopy,
  );
  assert.ok(
    row.detail.startsWith(txCopy.eventsOffchainTick),
    `row detail must open with the off-chain label, got: ${row.detail}`,
  );
  assert.ok(row.detail.includes("act"), "action present");
  assert.ok(row.detail.includes("amount 250"), "amount present");
  assert.ok(
    row.detail.includes("Momentum signal crossed the entry threshold"),
    "reason present",
  );
  assert.ok(row.detail.includes("1834ms"), "duration present");
  assert.ok(row.blockNumber === 0, "provenance block 0 carried to the drawer");
  assert.equal(row.kind, "Tick");
});

test("off-chain tick reason is clipped at ~80 chars", () => {
  const long = "x".repeat(200);
  const row = eventToTransaction(
    tickEvent({ action: "hold", reason: long }),
    getCopy("en").time,
    txCopy,
  );
  const reasonPart = row.detail.slice(row.detail.indexOf("x".repeat(10)) - 5);
  assert.ok(reasonPart.includes("…"), "reason ends with an ellipsis");
  assert.ok(!row.detail.includes("x".repeat(90)), "reason never fully printed");
});

test("blockNumber > 0 row rendering is unchanged (agent/block detail)", () => {
  const row = eventToTransaction(
    tickEvent({ tokenId: "7" }, 4213),
    getCopy("en").time,
    txCopy,
  );
  assert.equal(row.detail, "agent #7, block 4213");
  assert.ok(row.blockNumber === 4213);
});

test("drawer suppresses the explorer leg for block-0 rows only", () => {
  // Source guard: the drawer's explorerHref must gate on the synthetic block.
  assert.match(
    src,
    /tx\.blockNumber === 0 \? undefined : explorerTx\(tx\.hash\)/,
    "explorer leg skipped for off-chain ticks, kept for real txs",
  );
  // The Event proof row shows the payload detail instead of the generic
  // "decoded" line for confirmed off-chain ticks.
  const eventRow = src.match(/<dt>\{txCopy\.event\}<\/dt>[\s\S]*?<\/dd>/);
  assert.ok(eventRow, "event proof row present");
  assert.match(eventRow![0], /tx\.blockNumber === 0/);
});
