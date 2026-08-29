import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Watcher } from "./index.js";
import { getEventStore, EventStore } from "../events/store.js";

// Fake chain whose head is configurable; no logs so a resync tick is a no-op scan.
function makeFakeProvider(head: number) {
  return {
    async getNetwork() {
      return { chainId: 16602n };
    },
    async getBlockNumber() {
      return head;
    },
    async getBlock() {
      return null;
    },
    async getLogs() {
      return [] as unknown[];
    },
  };
}

function makeWatcher(
  provider: ReturnType<typeof makeFakeProvider>,
  logs: Record<string, unknown>[],
) {
  const watcher = new Watcher({
    provider: provider as never,
    watchList: [
      { name: "Transfer" as const, address: "0x" + "1".repeat(40) },
    ] as never,
    pollWindow: 20n,
    sink: async () => {},
    // No startBlock: cursor starts at 0n → the resync branch fires on the first tick.
    logger: (line) => logs.push(line),
  });
  (
    watcher as Watcher & { running: boolean; pollTick(): Promise<void> }
  ).running = true;
  return watcher;
}

// EventStore is a locked module singleton; point it at an isolated data dir and
// swap in a fresh in-memory instance for asserting the system.resync append.
const dataDir = mkdtempSync(join(tmpdir(), "resync-test-"));
process.env.AXIOM_DATA_DIR = dataDir;

let store: EventStore;
let realStore: EventStore | undefined;
let appended: { eventName: string; source: string }[] = [];

beforeEach(() => {
  realStore = undefined;
  const real = getEventStore();
  realStore = real;
  appended = [];
  // Wrap append (readonly singleton method) to observe appends without
  // touching store internals.
  const orig = real.append.bind(real);
  (real as unknown as { append: typeof orig }).append = (
    evt: Parameters<typeof orig>[0],
  ) => {
    appended.push({ eventName: evt.eventName, source: evt.source });
    return orig(evt);
  };
  store = real;
});

afterEach(() => {
  if (realStore) {
    (realStore as unknown as { append: EventStore["append"] }).append =
      EventStore.prototype.append;
  }
});

test("resync to latest-window is LOUD: error log with dropped range + system.resync event", async () => {
  const logs: Record<string, unknown>[] = [];
  const watcher = makeWatcher(makeFakeProvider(1000), logs);
  await (watcher as Watcher & { pollTick(): Promise<void> }).pollTick();

  const errs = logs.filter(
    (l) =>
      l.level === "error" &&
      String(l.msg).includes("resyncing to latest-window"),
  );
  assert.equal(
    errs.length,
    1,
    `expected one loud resync error: ${JSON.stringify(logs)}`,
  );
  // window=20, head=1000 → cursor 980; blocks <980 may be unprocessed.
  assert.equal(errs[0].droppedThroughBlock, "980");
  assert.equal(errs[0].latest, "1000");

  const resyncs = appended.filter(
    (a) => a.eventName === "system.resync" && a.source === "indexer",
  );
  assert.equal(resyncs.length, 1, "system.resync event must be appended once");
  // Cursor advances to (toBlock - REORG_SAFE_DEPTH) + 1; exact value depends on
  // runtime reorg-depth config, so only assert it moved past the resync point.
  assert.ok(
    watcher.cursor > 980n,
    `cursor must advance past the resync point, got ${watcher.cursor}`,
  );
});

test("AXIOM_QUIET_RESYNC=true restores the old silent behavior", async () => {
  process.env.AXIOM_QUIET_RESYNC = "true";
  try {
    const logs: Record<string, unknown>[] = [];
    const watcher = makeWatcher(makeFakeProvider(1000), logs);
    await (watcher as Watcher & { pollTick(): Promise<void> }).pollTick();

    const errs = logs.filter(
      (l) =>
        l.level === "error" &&
        String(l.msg).includes("resyncing to latest-window"),
    );
    assert.equal(errs.length, 0, "quiet mode must not emit the resync error");
    assert.deepEqual(
      appended.filter((a) => a.eventName === "system.resync"),
      [],
      "quiet mode must not append system.resync",
    );
    assert.ok(
      watcher.cursor > 980n,
      `cursor behavior unchanged in quiet mode, got ${watcher.cursor}`,
    );
  } finally {
    delete process.env.AXIOM_QUIET_RESYNC;
  }
});
