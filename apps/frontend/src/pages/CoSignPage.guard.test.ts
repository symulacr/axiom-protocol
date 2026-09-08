import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Structural regression guards for the F2a medium fixes (M11/M12): the
// Copied state must follow a resolved clipboard write, and a zero-connector
// config must not dead-end the receiver.
// Convention: useTransfer.dataHash.test.ts (regex on source).
const src = readFileSync(join(import.meta.dir, "CoSignPage.tsx"), "utf8");

test("M11: setCopied(true) fires only after a resolved clipboard write", () => {
  assert.doesNotMatch(
    src,
    /await navigator\.clipboard\?\.writeText/,
    "optional-chained write is gone",
  );
  assert.match(
    src,
    /if \(!clipboard\?\.writeText\) return;/,
    "missing clipboard API returns before any Copied state",
  );
  const write = src.indexOf("await clipboard.writeText(claimUrl);");
  const copied = src.indexOf("setCopied(true);");
  assert.ok(write >= 0 && copied > write, "Copied follows the resolved write");
});

test("M12: zero connectors render the existing no-wallet copy", () => {
  assert.match(
    src,
    /connectors\.length === 0 \?/,
    "empty-connectors branch present",
  );
  assert.match(
    src,
    /pageCopy\.wallet\.noWalletDetected/,
    "branch reuses the wallet-gate no-wallet copy",
  );
});
