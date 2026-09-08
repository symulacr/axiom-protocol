import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Structural regression guard (convention: ChatPage.guard.test.ts reads the
// source as text). 2026-09-08 incident: AskUserCard stayed live after an
// answer — re-clicking re-sent the same option as a new user message, so the
// identical option block appeared repeatedly in the thread.
const src = readFileSync(join(import.meta.dir, "MessageAtoms.tsx"), "utf8");

test("AskUserCard goes inert after an answer", () => {
  assert.match(
    src,
    /const \[answered, setAnswered\] = useState<string \| null>\(null\);/,
    "AskUserCard tracks the submitted answer",
  );
  assert.match(
    src,
    /setAnswered\(answer\);\s*\n\s*onAnswer\(answer\);/,
    "submit records the answer before notifying the page",
  );
  const disables = src.match(/disabled=\{answered !== null/g) ?? [];
  assert.ok(
    disables.length >= 3,
    `options, multi-select submit and free-text path all disable once answered; found ${disables.length}`,
  );
});
