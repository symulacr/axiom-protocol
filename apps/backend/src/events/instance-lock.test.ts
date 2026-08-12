import assert from "node:assert/strict";
import { test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireEventStoreLock } from "./store.js";

test("second acquire on same dir throws unless multi-instance allowed", () => {
  const dir = mkdtempSync(join(tmpdir(), "evlock-"));
  const prev = process.env.AXIOM_ALLOW_MULTI_INSTANCE;
  delete process.env.AXIOM_ALLOW_MULTI_INSTANCE;
  try {
    const release = acquireEventStoreLock(dir);
    assert.throws(() => acquireEventStoreLock(dir), /EventStore lock held/);
    release();
    // After release, can acquire again
    const release2 = acquireEventStoreLock(dir);
    release2();
  } finally {
    if (prev === undefined) delete process.env.AXIOM_ALLOW_MULTI_INSTANCE;
    else process.env.AXIOM_ALLOW_MULTI_INSTANCE = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});
