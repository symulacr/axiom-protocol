import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Structural regression guards for the ChatPage concurrency fixes (W1-4/W1-5):
// Regenerate/Retry bypass the send queue, so runAgent itself must refuse
// concurrent entry, and edit-resend must invalidate any in-flight run.
// Convention: useTransfer.dataHash.test.ts (regex on source).
const src = readFileSync(join(import.meta.dir, "ChatPage.tsx"), "utf8");

test("runAgent refuses concurrent entry", () => {
  const guard = src.indexOf("if (isStreamingRef.current) return;");
  const set = src.indexOf("isStreamingRef.current = true;");
  assert.ok(guard >= 0, "entry guard present");
  assert.ok(set >= 0, "streaming flag assignment present");
  assert.ok(guard < set, "guard must precede the streaming-flag assignment");
});

test("regenerate and retry call sites guard on streaming ref", () => {
  const regenerate = src.indexOf("title={chatCopy.regenerate}");
  const retry = src.indexOf("const last = lastStreamErrorRef.current;");
  assert.ok(regenerate >= 0 && retry >= 0);
  // Three call-site guards total: runAgent entry + Regenerate + Retry.
  const guards = src.match(/if \(isStreamingRef\.current\) return;/g) ?? [];
  assert.ok(guards.length >= 3, `expected ≥3 guards, found ${guards.length}`);
});
