import { test, afterAll } from "bun:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keccak256, Wallet } from "ethers";

import { InMemoryStorage, ZeroGStorage } from "@axiom/config/storage/0g";

const NEVER_SEEN = ("0x" + "00".repeat(32)) as `0x${string}`;
const TEST_WALLET = new Wallet("0x" + "11".repeat(32));

const tmpDirs: string[] = [];

function makeBackingFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "oracle-seen-"));
  tmpDirs.push(dir);
  return join(dir, "oracle-seen-hashes.json");
}

afterAll(() => {
  for (const dir of tmpDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort tmp cleanup */
    }
  }
});

/** Shared durability walk: mark → file exists → new instance on the same file
 *  still sees the hash, and never-marked hashes stay unseen. */
function assertDurableSeenHashes(
  make: (file: string) => InMemoryStorage | ZeroGStorage,
  file: string,
  dataHash: `0x${string}`,
): void {
  const before = make(file);
  assert.equal(
    before.hasSeenDataHash(dataHash),
    false,
    "fresh registry should not have seen the hash yet",
  );
  before.markDataHashSeen(dataHash);
  assert.equal(
    before.hasSeenDataHash(dataHash),
    true,
    "marked hash should be seen in the same instance",
  );
  assert.equal(existsSync(file), true, "backing file must be created on mark");

  const afterRestart = make(file);
  assert.equal(
    afterRestart.hasSeenDataHash(dataHash),
    true,
    "marked hash must survive a restart (durable backing)",
  );
  assert.equal(
    afterRestart.hasSeenDataHash(NEVER_SEEN),
    false,
    "a never-marked hash must remain unseen",
  );
}

test("inmemory_seen_hashes_persist_across_restart", () => {
  const file = makeBackingFile();
  const dataHash = keccak256(new Uint8Array([1, 2, 3])) as `0x${string}`;
  console.log(`[durable] InMemoryStorage backing file: ${file}`);
  assertDurableSeenHashes(
    (f) => new InMemoryStorage({ seenHashesFile: f }),
    file,
    dataHash,
  );
});

test("zerogstorage_seen_hashes_persist_across_restart", () => {
  const file = makeBackingFile();
  const dataHash = keccak256(new Uint8Array([4, 5, 6])) as `0x${string}`;
  console.log(`[durable] ZeroGStorage backing file: ${file}`);
  const config = {
    indexerRpc: "http://127.0.0.1:0",
    evmRpc: "http://127.0.0.1:0",
    signer: TEST_WALLET,
  };
  assertDurableSeenHashes(
    (f) => new ZeroGStorage(config, { seenHashesFile: f }),
    file,
    dataHash,
  );
});
