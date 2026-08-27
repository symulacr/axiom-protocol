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

test("edit-confirm bumps run epoch and aborts in-flight run", () => {
  const bumps = src.match(/runEpochRef\.current \+= 1;/g) ?? [];
  assert.ok(
    bumps.length >= 3,
    `expected epoch bump in startNewChat, openThread AND editConfirm; found ${bumps.length}`,
  );
  assert.match(
    src,
    /runEpochRef\.current \+= 1;\s*\n\s*abortRef\.current\?\.abort\(\);/,
  );
});

// R1-8: a tool_calls message with no live toolRun (post-run reset or never
// marked id) must not synthesize a `running` run — that renders a spinner +
// "0s…" elapsed clock forever on a card whose tool already finished/failed.
test("tool-card fallback run is never a synthetic running state (R1-8)", () => {
  const fallback = src.indexOf("run ?? {");
  assert.ok(fallback >= 0, "tool-card fallback run present");
  const window = src.slice(fallback, fallback + 400);
  assert.doesNotMatch(
    window,
    /status:\s*"running"/,
    "fallback run must never be status running (stale Loading 0s… card)",
  );
  assert.match(
    window,
    /status:\s*"error"/,
    "fallback run reads as an honest failed state",
  );
  // The success/error paths mark real runs; only the no-run fallback is guarded here.
  assert.match(src, /status: "running",\s*\n\s*startedAt: Date\.now\(\)/);
});
