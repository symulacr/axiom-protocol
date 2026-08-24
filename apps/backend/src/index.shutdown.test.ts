import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

// Structural guard for the bounded graceful shutdown (W1-8): SIGTERM must
// await the indexer stop (final checkpoint) and bound the drain with an
// unref'd forced-exit timer. Process-exit semantics are dev-run verified.
process.env.AXIOM_DATA_DIR = mkdtempSync(join(tmpdir(), "shutdown-test-"));

const src = readFileSync(join(import.meta.dir, "index.ts"), "utf8");

test("shutdown awaits indexer stop before flush", () => {
  const stopIdx = src.indexOf("await indexer.stop();");
  const flushIdx = src.indexOf("await getEventStore().flush();");
  assert.ok(stopIdx >= 0, "indexer.stop() must be awaited");
  assert.ok(flushIdx >= 0, "EventStore flush must be awaited");
  assert.ok(stopIdx < flushIdx, "stop must complete before flush");
});

test("forced-exit timer bounds the drain", () => {
  assert.match(src, /setTimeout\(\(\) => process\.exit\(1\), 10_000\)/);
  assert.match(src, /forceExit\.unref\(\)/);
});
