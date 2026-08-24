import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Structural regression guards for the useEventStream reconnect-storm fix
// (W1-1/W1-2): the connect effect must key on the joined topic string, never
// the raw (render-unstable) topics array, and late-resolving handshakes must
// not orphan sockets after unmount. Convention: useTransfer.dataHash.test.ts.
const src = readFileSync(join(import.meta.dir, "useEventStream.ts"), "utf8");

test("connect deps omit raw topics array", () => {
  assert.doesNotMatch(src, /\[enabled,\s*topics,\s*topicsKey/);
});

test("connect deps keyed on topicsKey", () => {
  assert.match(src, /\[enabled,\s*topicsKey,\s*scheduleReconnect\]/);
});

test("empty topic key does not produce phantom topic entry", () => {
  assert.match(src, /topicsKey\s*\?\s*topicsKey\.split\(","\)\s*:\s*\[\]/);
});
