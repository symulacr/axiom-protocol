import assert from "node:assert/strict";
import { test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Watcher } from "./index.js";

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
  provider: ReturnType<typeof makeFakeProvider>,
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
  (
    watcher as Watcher & { running: boolean; pollTick(): Promise<void> }
  ).running = true;
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
  await (
    watcher as Watcher & { running: boolean; pollTick(): Promise<void> }
  ).pollTick();
  provider.setHead(120);
  await (
    watcher as Watcher & { running: boolean; pollTick(): Promise<void> }
  ).pollTick();
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
  await (
    watcher as Watcher & { running: boolean; pollTick(): Promise<void> }
  ).pollTick(); // cursor lands at safe block with stored hash
  // The chain replaces history from the cursor's verified block onward.
  const cursorBlock = Number(watcher.cursor) - 1;
  provider.rewrite(cursorBlock, "0x" + "e".repeat(64));
  await (
    watcher as Watcher & { running: boolean; pollTick(): Promise<void> }
  ).pollTick();
  const warnings = captured.logs.filter(
    (l) => String(l.msg) === "reorg detected — block hash mismatch",
  );
  assert.equal(warnings.length, 1, "real reorg must be detected once");
  assert.deepEqual(captured.rolledBack.map(String), [String(cursorBlock)]);
});

// --- W1-6: flush-before-checkpoint ordering (crash-window guard) ---

import { encodeEventTopics } from "viem";
import type { Log } from "ethers";
import { EVENT_ABI } from "./events.js";
import { existsSync } from "node:fs";

const TX_W16 = "0x" + "cd".repeat(32);

function transferLogW16(block = 100): Log {
  const topics = encodeEventTopics({
    abi: [EVENT_ABI.Transfer],
    eventName: "Transfer",
    args: {
      from: "0x" + "11".repeat(20),
      to: "0x" + "22".repeat(20),
      tokenId: 999n,
    },
  });
  return {
    topics,
    data: "0x",
    blockNumber: block,
    transactionHash: TX_W16,
    index: 0,
    address: "0x" + "1".repeat(40),
  } as unknown as Log;
}

function checkpointPathFor(dataDir: string): string {
  return join(dataDir, "checkpoints", "checkpoint-16602.json");
}

test("flush runs before checkpoint write", async () => {
  const provider = makeFakeProvider();
  (provider as { getLogs(): Promise<unknown[]> }).getLogs = async () => [
    transferLogW16(),
  ];
  let flushCalls = 0;
  const delivered: unknown[] = [];
  const watcher = new Watcher({
    provider: provider as never,
    watchList: [
      { name: "Transfer" as const, address: "0x" + "1".repeat(40) },
    ] as never,
    pollWindow: 20n,
    pollIntervalMs: 10,
    sink: async (ev) => {
      delivered.push(ev);
    },
    startBlock: 90n,
    logger: () => {},
    beforeCheckpoint: async () => {
      flushCalls++;
    },
  });
  (
    watcher as Watcher & { running: boolean; pollTick(): Promise<void> }
  ).running = true;
  await (watcher as Watcher & { pollTick(): Promise<void> }).pollTick();

  assert.equal(delivered.length, 1, "event must be delivered to the sink");
  assert.equal(flushCalls, 1, "beforeCheckpoint hook must run once per tick");
  assert.ok(
    watcher.cursor > 90n,
    "cursor advances when the flush hook succeeds",
  );
});

test("flush failure blocks checkpoint advance", async () => {
  const provider = makeFakeProvider();
  (provider as { getLogs(): Promise<unknown[]> }).getLogs = async () => [
    transferLogW16(),
  ];
  const watcher = new Watcher({
    provider: provider as never,
    watchList: [
      { name: "Transfer" as const, address: "0x" + "1".repeat(40) },
    ] as never,
    pollWindow: 20n,
    pollIntervalMs: 10,
    sink: async () => {},
    startBlock: 90n,
    logger: () => {},
    // Simulate EventStore.flush() throwing (disk failure): the checkpoint
    // must NOT advance or those blocks would be skipped forever.
    beforeCheckpoint: async () => {
      throw new Error("flush failed");
    },
  });
  (
    watcher as Watcher & { running: boolean; pollTick(): Promise<void> }
  ).running = true;
  await (watcher as Watcher & { pollTick(): Promise<void> }).pollTick();
  assert.equal(watcher.cursor, 90n, "cursor must not advance when flush fails");
});

test("sink failure still blocks checkpoint advance", async () => {
  const provider = makeFakeProvider();
  (provider as { getLogs(): Promise<unknown[]> }).getLogs = async () => [
    transferLogW16(),
  ];
  const watcher = new Watcher({
    provider: provider as never,
    watchList: [
      { name: "Transfer" as const, address: "0x" + "1".repeat(40) },
    ] as never,
    pollWindow: 20n,
    pollIntervalMs: 10,
    sink: async () => {
      throw new Error("sink down");
    },
    startBlock: 90n,
    logger: () => {},
  });
  (
    watcher as Watcher & { running: boolean; pollTick(): Promise<void> }
  ).running = true;
  await (watcher as Watcher & { pollTick(): Promise<void> }).pollTick();
  assert.equal(watcher.cursor, 90n, "cursor must not advance on sink failure");
});
