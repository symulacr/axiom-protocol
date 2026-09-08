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
