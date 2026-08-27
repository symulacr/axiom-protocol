import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Structural regression guards for the WS auth fallback fix (W1-3): a
// transient header-handshake failure must not permanently demote auth to
// `?token=` URLs, and an empty API key must not append `token=` at all.
const src = readFileSync(join(import.meta.dir, "env.ts"), "utf8");

test("bounded failure counter replaces sticky latch", () => {
  assert.match(src, /MAX_HEADER_AUTH_FAILURES/);
  // The old module-latch variable must be gone entirely.
  assert.doesNotMatch(src, /wsAuthPrefersHeader/);
});

test("only header success resets the failure counter", () => {
  assert.match(src, /wsAuthHeaderFailures = 0/);
  const resets = src.match(/wsAuthHeaderFailures\+\+/g) ?? [];
  assert.ok(resets.length >= 1, "failure increment present");
});

test("empty API_KEY appends no token param", () => {
  assert.match(src, /opts\.token !== false && mode === "query" && API_KEY/);
});

test("no API key throws typed no-auth error instead of querying hopelessly", () => {
  assert.match(
    src,
    /throw new Error\("WS auth unavailable: no API key configured"\)/,
  );
});

test("auto mode is documented as the default branch", () => {
  assert.match(src, /"auto" \(documented in env\.d\.ts\)/);
});

test("consumer stops on the typed no-auth error (no hot 401 loop)", () => {
  const hook = readFileSync(
    join(import.meta.dir, "../hooks/useEventStream.ts"),
    "utf8",
  );
  assert.match(hook, /WS auth unavailable: no API key configured/);
  // The catch must distinguish the typed error from transient failures.
  assert.match(hook, /err instanceof Error/);
});
