import assert from "node:assert/strict";
import { test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tryAcquireTickSlot, releaseTickSlot } from "./orchestrator.js";

test("second concurrent tick for same tokenId is refused", () => {
  assert.equal(tryAcquireTickSlot("777"), true);
  assert.equal(
    tryAcquireTickSlot("777"),
    false,
    "second acquire while in flight must fail",
  );
  releaseTickSlot("777");
});

test("different tokenIds are not serialized", () => {
  assert.equal(tryAcquireTickSlot("888"), true);
  assert.equal(tryAcquireTickSlot("889"), true, "other tokens stay parallel");
  releaseTickSlot("888");
  releaseTickSlot("889");
});

test("in-flight slot clears after completion", () => {
  tryAcquireTickSlot("890");
  releaseTickSlot("890");
  assert.equal(tryAcquireTickSlot("890"), true, "slot must be reusable");
  releaseTickSlot("890");
});

test("route wires the guard and NonceManager wraps the signer", () => {
  const route = readFileSync(join(import.meta.dir, "orchestrator.ts"), "utf8");
  assert.match(route, /tryAcquireTickSlot\(tickKey\)/);
  assert.match(route, /TICK_IN_FLIGHT/);
  assert.match(route, /releaseTickSlot\(tickKey\)/);
  const orchestrator = readFileSync(
    join(import.meta.dir, "..", "orchestrator", "index.ts"),
    "utf8",
  );
  assert.match(orchestrator, /new NonceManager\(config\.signer\)/);
});
