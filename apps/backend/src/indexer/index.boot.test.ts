import { test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

// Structural guard (repo convention, cf. useTransfer.dataHash.test.ts): the
// dead mainnet-biased `?? 16661` fallback must stay out of the indexer —
// AXIOM_CHAIN_ID is zod-coerced with a default upstream.
const src = readFileSync(join(import.meta.dir, "index.ts"), "utf8");

test("indexer sink has no dead 16661 chain-id fallback", () => {
  assert.doesNotMatch(src, /\?\?\s*16661/);
});
