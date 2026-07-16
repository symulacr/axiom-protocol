import assert from "node:assert/strict";
import test from "node:test";

/** Mirrors watcher reorg-safe checkpoint advancement. */
function nextCheckpoint(toBlock: bigint, reorgDepth: bigint): bigint {
  const safeBlock = toBlock > reorgDepth ? toBlock - reorgDepth : 0n;
  return safeBlock + 1n;
}

test("checkpoint stays reorg-safe depth behind head", () => {
  assert.equal(nextCheckpoint(1000n, 10n), 991n);
  assert.equal(nextCheckpoint(5n, 10n), 1n);
  assert.equal(nextCheckpoint(10n, 10n), 1n);
});
