import assert from "node:assert/strict";
import { test } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
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

test("stale lock from a dead pid is stolen; live pid still refuses", () => {
  const dir = mkdtempSync(join(tmpdir(), "evlock-stale-"));
  const prev = process.env.AXIOM_ALLOW_MULTI_INSTANCE;
  delete process.env.AXIOM_ALLOW_MULTI_INSTANCE;
  try {
    const lockPath = join(dir, ".data", "event-store.lock");
    // Simulate a crash: write a lock whose holder pid cannot exist.
    mkdirSync(join(dir, ".data"), { recursive: true });
    writeFileSync(lockPath, "999999999\nstale\n");
    const release = acquireEventStoreLock(dir); // must steal, not throw
    assert.equal(
      readFileSync(lockPath, "utf-8").trim().split("\n")[0],
      String(process.pid),
    );

    // A live holder must still be refused: overwrite the lock content with a
    // genuinely alive pid (async spawn so it survives), expect refusal.
    const sleeper = Bun.spawn(["sleep", "2"]);
    writeFileSync(lockPath, `${sleeper.pid}\nlive\n`);
    assert.throws(() => acquireEventStoreLock(dir), /EventStore lock held/);
    sleeper.kill();
    release();
  } finally {
    if (prev === undefined) delete process.env.AXIOM_ALLOW_MULTI_INSTANCE;
    else process.env.AXIOM_ALLOW_MULTI_INSTANCE = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});
