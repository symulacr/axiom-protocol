import { test } from "bun:test";
import assert from "node:assert/strict";
import { Wallet } from "ethers";
import { StrategyRunner } from "../../src/orchestrator/index.js";

function makeSigner(): Wallet {
  return new Wallet("0x" + "11".repeat(32));
}

test("StrategyRunner with an unsupported/testnet chainId throws at construction time (fail-fast, not silent misrouting)", () => {
  assert.throws(
    () =>
      new StrategyRunner({
        evmRpc: "https://example.invalid",
        signer: makeSigner(),
        oracleBaseUrl: "http://127.0.0.1:8787",
        // 16602 (galileo) became a supported network; use a testnet that is
        // genuinely absent from the OG_NETWORKS map.
        chainId: 11155111,
      }),
    /Unsupported chainId 11155111/,
  );
});

test("StrategyRunner with an unsupported chainId throws at construction time (fail-fast, not silent misrouting)", () => {
  assert.throws(
    () =>
      new StrategyRunner({
        evmRpc: "https://example.invalid",
        signer: makeSigner(),
        oracleBaseUrl: "http://127.0.0.1:8787",
        chainId: 1,
      }),
    /Unsupported chainId 1/,
  );
});
