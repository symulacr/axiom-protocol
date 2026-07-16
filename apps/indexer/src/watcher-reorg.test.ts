import assert from "node:assert/strict";
import test from "node:test";
import {
  nextCheckpointBlock,
  REORG_SAFE_DEPTH,
} from "./watcher.js";

test("nextCheckpointBlock stays reorg-safe depth behind head", () => {
  assert.equal(nextCheckpointBlock(1000n, 10n), 991n);
  assert.equal(nextCheckpointBlock(5n, 10n), 1n);
  assert.equal(nextCheckpointBlock(10n, 10n), 1n);
  assert.equal(nextCheckpointBlock(1000n), nextCheckpointBlock(1000n, REORG_SAFE_DEPTH));
  assert.equal(REORG_SAFE_DEPTH, 10n);
});

test("nextCheckpointBlock never jumps to toBlock+1 past reorg depth", () => {
  const toBlock = 500n;
  const next = nextCheckpointBlock(toBlock, REORG_SAFE_DEPTH);
  assert.ok(next <= toBlock - REORG_SAFE_DEPTH + 1n);
  assert.notEqual(next, toBlock + 1n);
});
