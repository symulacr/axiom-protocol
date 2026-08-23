import assert from "node:assert/strict";
import { test, beforeEach } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Watcher } from "./watcher.js";

// Deterministic fake chain: hash(n) = 0x + n padded, unless a reorg is staged
// for that height (reorgs map flips the canonical hash after `forkAt`).
function makeFakeProvider(opts: { forkAt?: number; forkHash?: string } = {}) {
  const hashes = new Map<number, string>();
  const hashFor = (n: number): string => {
    if (opts.forkAt !== undefined && n >= opts.forkAt) {
      return opts.forkHash ?? "0x" + "f".repeat(64);
    }
    return "0x" + n.toString(16).padStart(64, "0");
  };
  let head = 100;
  const provider = {
    async getNetwork() {
      return { chainId: 16602n };
    },
    async getBlockNumber() {
      return head;
    },
    async getBlock(n: number) {
      if (n > head) return null;
      const h = hashes.get(n) ?? hashFor(n);
      return { hash: h, number: n };
    },
    async getLogs() {
      return [] as unknown[];
    },
    setHead(n: number) {
      head = n;
    },
    rewrite(n: number, h: string) {
      hashes.set(n, h);
    },
  };
  return provider;
}

function makeWatcher(
  provider: any,
  captured: {
    logs: Record<string, unknown>[];
    rolledBack: (number | bigint)[];
  },
) {
  const watcher = new Watcher({
    provider: provider as never,
    watchList: [
      { name: "Transfer" as const, address: "0x" + "1".repeat(40) },
    ] as never,
    pollWindow: 20n,
    sink: async () => {},
    startBlock: 90n,
    logger: (line) => captured.logs.push(line),
    onReorg: (b) => captured.rolledBack.push(b),
  });
  // pollTick() early-returns unless the loop has been started; drive it directly.
  (watcher as any).running = true;
  return watcher;
}

process.env.AXIOM_DATA_DIR = mkdtempSync(join(tmpdir(), "watcher-test-"));

test("consecutive polls on a stable chain never fire a false reorg", async () => {
  const provider = makeFakeProvider();
  const captured = {
    logs: [] as Record<string, unknown>[],
    rolledBack: [] as (number | bigint)[],
  };
  const watcher = makeWatcher(provider, captured);
  // Two ticks over an advancing, stable chain.
  await (watcher as any).pollTick();
  provider.setHead(120);
  await (watcher as any).pollTick();
  const warnings = captured.logs.filter(
    (l) => String(l.msg) === "reorg detected — block hash mismatch",
  );
  assert.equal(
    warnings.length,
    0,
    `false reorg warnings: ${JSON.stringify(warnings)}`,
  );
  assert.deepEqual(captured.rolledBack, []);
});

test("a real reorg at the cursor is detected exactly once and rolls back", async () => {
  const provider = makeFakeProvider();
  const captured = {
    logs: [] as Record<string, unknown>[],
    rolledBack: [] as (number | bigint)[],
  };
  const watcher = makeWatcher(provider, captured);
  await (watcher as any).pollTick(); // cursor lands at safe block with stored hash
  // The chain replaces history from the cursor's verified block onward.
  const cursorBlock = Number(watcher.cursor) - 1;
  provider.rewrite(cursorBlock, "0x" + "e".repeat(64));
  await (watcher as any).pollTick();
  const warnings = captured.logs.filter(
    (l) => String(l.msg) === "reorg detected — block hash mismatch",
  );
  assert.equal(warnings.length, 1, "real reorg must be detected once");
  assert.deepEqual(captured.rolledBack.map(String), [String(cursorBlock)]);
});
