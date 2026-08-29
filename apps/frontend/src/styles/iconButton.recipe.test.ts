import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Structural guard for the ONE icon-button recipe (design plan §2):
// every icon-only button must carry the canonical `.icon-button` class
// (optionally with --sm/--lg/--ghost modifiers). Convention:
// ChatPage.guard.test.ts (regex on source).
const roots = [
  join(import.meta.dir, "../components/axiom"),
  join(import.meta.dir, "../chat"),
  join(import.meta.dir, "../pages"),
];

const files: Array<[rootIndex: number, file: string]> = [
  [0, "AppShell.tsx"],
  [1, "MessageAtoms.tsx"],
  [2, "ChatPage.tsx"],
];

test("every icon-button call site uses the canonical recipe class", () => {
  const offenders: string[] = [];
  const classNameStrings = /className=\{?[`"'][^`"']*[`"']/g;
  const legacy = /\b(shell-icon-btn|chat-history__delete|chat-queue-remove)\b/;

  for (const [rootIndex, file] of files) {
    const src = readFileSync(join(roots[rootIndex], file), "utf8");
    for (const m of src.matchAll(classNameStrings)) {
      if (legacy.test(m[0]) && !m[0].includes("icon-button")) {
        offenders.push(`${file}: ${m[0]}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `icon-only buttons found outside the .icon-button recipe: ${offenders.join(", ")}`,
  );
});

test("icon-button recipe modifiers and tokens exist in the stylesheet", () => {
  const css = readFileSync(
    join(import.meta.dir, "../styles/index.css"),
    "utf8",
  );
  for (const needle of [
    "--icon-hit-sm: 24px",
    "--icon-hit-md: 32px",
    "--icon-hit-lg: 40px",
    "icon-button--sm",
    "icon-button--lg",
    "icon-button--ghost",
  ]) {
    assert.ok(css.includes(needle), `missing in index.css: ${needle}`);
  }
  assert.ok(
    !css.includes(".shell-icon-btn"),
    "shell-icon-btn must stay retired",
  );
});
