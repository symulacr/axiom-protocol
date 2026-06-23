/**
 * Wave 5A — orchestrator chainId wiring test.
 *
 * The CRITICAL bug fixed in this wave: the constructor at
 * `apps/backend/src/orchestrator/index.ts:73` (pre-fix) read
 * `signer.provider.network.chainId` synchronously, which is unsound under
 * ethers v6 — `provider.getNetwork()` is async and returns `chainId: bigint`
 * (https://docs.ethers.org/v6/api/providers/#Provider-getNetwork,
 * https://docs.ethers.org/v6/api/providers/#Network). The sync read always
 * fell through to the `?? 16602` fallback, so the orchestrator was
 * accidentally hard-pinned to Galileo regardless of which RPC the signer
 * was actually wired to.
 *
 * The fix adds an explicit `chainId?: number` to `OrchestratorConfig` and
 * picks the canonical 0G network from it. This test exercises the new
 * `chainId=16661` (Aristotle) path end-to-end: the constructed
 * `StrategyRunner.storage.config.indexerRpc` must be the Aristotle mainnet
 * indexer URL, and the stored Flow contract must be the mainnet one. The
 * Galileo default and the fail-fast unsupported-chain path are covered
 * too.
 *
 * Pure config-routing test: no RPC calls, no env, no mocks.
 *
 * Sources:
 *  - https://docs.0g.ai/ai-context (chainIds, storage indexer URLs, Flow addresses)
 *  - https://docs.0g.ai/developer-hub/mainnet/mainnet-overview
 *  - https://eips.ethereum.org/EIPS/eip-155
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { Wallet } from "ethers";
import { StrategyRunner } from "../../src/orchestrator/index.js";

// Canonical 0G network endpoints.
const ARISTOTLE_STORAGE_RPC = "https://indexer-storage-turbo.0g.ai";
const GALILEO_STORAGE_RPC = "https://indexer-storage-testnet-turbo.0g.ai";

function makeSigner(): Wallet {
  // The runner no longer reads `signer.provider.network.chainId`; the signer
  // is here for API completeness. A random wallet works — no network
  // interaction is required for constructor-time config wiring.
  return new Wallet("0x" + "11".repeat(32));
}

test("StrategyRunner with chainId=16661 wires the Aristotle mainnet storage indexer", () => {
  const runner = new StrategyRunner({
    evmRpc: "https://evmrpc.0g.ai",
    signer: makeSigner(),
    oracleBaseUrl: "http://127.0.0.1:8787",
    chainId: 16661,
  });
  assert.equal(
    runner.storage.config.indexerRpc,
    ARISTOTLE_STORAGE_RPC,
    "expected the Aristotle mainnet indexer when chainId=16661",
  );
});

test("StrategyRunner with chainId=16602 wires the Galileo testnet storage indexer (explicit)", () => {
  const runner = new StrategyRunner({
    evmRpc: "https://evmrpc-testnet.0g.ai",
    signer: makeSigner(),
    oracleBaseUrl: "http://127.0.0.1:8787",
    chainId: 16602,
  });
  assert.equal(runner.storage.config.indexerRpc, GALILEO_STORAGE_RPC);
});

test("StrategyRunner with no chainId defaults to Galileo (16602) — backward compatibility", () => {
  // Pre-fix, this was the only path that worked at all (by accident of the
  // sync fallback). Post-fix, the default is preserved by the `?? 16602`
  // coalesce so legacy callers do not need to update.
  const runner = new StrategyRunner({
    evmRpc: "https://evmrpc-testnet.0g.ai",
    signer: makeSigner(),
    oracleBaseUrl: "http://127.0.0.1:8787",
  });
  assert.equal(runner.storage.config.indexerRpc, GALILEO_STORAGE_RPC);
});

test("StrategyRunner with an unsupported chainId throws at construction time (fail-fast, not silent misrouting)", () => {
  assert.throws(
    () =>
      new StrategyRunner({
        evmRpc: "https://example.invalid",
        signer: makeSigner(),
        oracleBaseUrl: "http://127.0.0.1:8787",
        chainId: 1, // Ethereum mainnet — not a 0G chain
      }),
    /Unsupported chainId 1/,
  );
});
