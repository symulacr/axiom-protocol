/**
 * Structural test: FE re-key proofs must use on-chain (old) dataHash (C2)
 * and seal DEK for oracle (C1) instead of sending cleartext on the wire.
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

test("useTransfer seals DEK for oracle (no cleartext oldDataEncryptionKey on wire)", () => {
  assert.match(src, /sealDekForOracle|sealedDataEncryptionKey/);
  assert.match(src, /sealedDataEncryptionKey/);
  // Must not assign cleartext key into challenge body.
  assert.doesNotMatch(
    src,
    /challengeBody\.oldDataEncryptionKey\s*=\s*input\.oldDataEncryptionKey/,
  );
});
