import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const mod = await import(pathToFileURL(path.join(dir, "mintPayload.ts")).href);
const buildDefaultPayload = mod.buildDefaultPayload as (n: string) => string;

describe("buildDefaultPayload", () => {
  it("auto-builds JSON from agent name only", () => {
    const raw = buildDefaultPayload("Scout");
    const parsed = JSON.parse(raw) as {
      name: string;
      kind: string;
      strategy: string;
    };
    assert.equal(parsed.name, "Scout");
    assert.equal(parsed.kind, "axiom-inft-agent");
    assert.equal(parsed.strategy, "default");
    assert.match(raw, /Scout/);
  });

  it("falls back when name empty", () => {
    const parsed = JSON.parse(buildDefaultPayload("  ")) as { name: string };
    assert.equal(parsed.name, "Axiom agent");
  });
});
