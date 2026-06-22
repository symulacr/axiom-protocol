/**
 * Wave 3C — chain-id picker tests.
 *
 * Asserts the typed network table resolves the canonical Galileo (16602)
 * and Aristotle (16661) entries and returns null for unsupported chainIds.
 * Pure logic; no RPC calls, no env requirements. Runs on every `pnpm test`.
 *
 * Sources:
 *  - https://docs.0g.ai/ai-context (chainIds, storage indexer URLs, Flow addresses)
 *  - https://docs.0g.ai/developer-hub/mainnet/mainnet-overview
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { OG_NETWORKS, pickOGNetwork } from "../../src/storage/0g.js";

test("pickOGNetwork(16602) returns the Galileo testnet entry", () => {
  const network = pickOGNetwork(16602);
  assert.ok(network, "expected a network entry for chainId 16602");
  assert.equal(network.name, "galileo");
  assert.equal(network.storageRpc, "https://indexer-storage-testnet-turbo.0g.ai");
  assert.equal(network.flowContract, "0x22E03a6A89B950F1c82ec5e74F8eCa321a105296");
  assert.equal(network.chainId, 16602);
});

test("pickOGNetwork(16661) returns the Aristotle mainnet entry", () => {
  const network = pickOGNetwork(16661);
  assert.ok(network, "expected a network entry for chainId 16661");
  assert.equal(network.name, "aristotle");
  assert.equal(network.storageRpc, "https://indexer-storage-turbo.0g.ai");
  assert.equal(network.flowContract, "0x62D4144dB0F0a6fBBaeb6296c785C71B3D57C526");
  assert.equal(network.chainId, 16661);
});

test("pickOGNetwork(1) returns null (Ethereum mainnet is not a 0G chain)", () => {
  assert.equal(pickOGNetwork(1), null);
});

test("pickOGNetwork(0) returns null (uninitialized chainId)", () => {
  assert.equal(pickOGNetwork(0), null);
});

test("OG_NETWORKS has exactly the two canonical 0G chains", () => {
  assert.deepEqual(
    Object.keys(OG_NETWORKS).map(Number).sort((a, b) => a - b),
    [16602, 16661],
  );
});
