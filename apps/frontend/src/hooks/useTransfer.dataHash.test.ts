/**
 * Structural test: FE re-key proofs must use on-chain (old) dataHash.
 * Regression for deep-dive C2.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const src = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "useTransfer.ts"),
  "utf8",
);

test("useTransfer always binds AccessProof dataHash to challenge.dataHash (old)", () => {
  assert.match(src, /const proofDataHash = challenge\.dataHash/);
  assert.doesNotMatch(
    src,
    /challenge\.rekeyed && challenge\.newDataHash\s*\?\s*challenge\.newDataHash/,
  );
});
