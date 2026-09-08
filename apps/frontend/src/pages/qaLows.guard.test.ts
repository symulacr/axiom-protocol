import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Structural regression guards for the QA copy-accuracy lows (H-L6, B-L3):
// the bare /transfer/co-sign branch is the whole document, so it must carry
// the page h1; receipt ages ladder minutes → hours → days instead of
// rendering bare minutes for multi-day rows.
// Convention: useTransfer.dataHash.test.ts (regex on source).
const cosign = readFileSync(join(import.meta.dir, "CoSignPage.tsx"), "utf8");
const txPage = readFileSync(
  join(import.meta.dir, "TransactionsPage.tsx"),
  "utf8",
);

test("H-L6: bare /transfer/co-sign branch renders the page h1", () => {
  const branch = cosign.match(/data-testid="cosign-no-link"[\s\S]*?<\/div>/);
  assert.ok(branch, "no-link branch present");
  assert.match(
    branch[0],
    /<h1 className="review-cosign-title">/,
    "no-link title is the document h1",
  );
  assert.doesNotMatch(branch[0], /<h2/, "no stray h2 left on the branch");
});

test("B-L3: receipt ages ladder into hours and days past 119 minutes", () => {
  assert.match(txPage, /minutes < 120\) return time\.minutesAgo/);
  assert.match(txPage, /hours < 48\) return time\.hoursAgo/);
  assert.match(txPage, /return time\.daysAgo\(/);
  const direct = txPage.match(/time\.minutesAgo\(/g) ?? [];
  assert.equal(
    direct.length,
    1,
    "only the ladder itself calls minutesAgo — both age consumers route through ageLabel",
  );
});
