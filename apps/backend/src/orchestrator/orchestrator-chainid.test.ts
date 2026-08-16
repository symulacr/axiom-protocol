import { test } from "bun:test";
import assert from "node:assert/strict";
import { Wallet } from "ethers";
import { StrategyRunner } from "../../src/orchestrator/index.js";
import { getComputeBaseUrl } from "../../src/compute/index.js";

function makeSigner(): Wallet {
  return new Wallet("0x" + "11".repeat(32));
}

test("StrategyRunner with an unsupported/testnet chainId throws at construction time (fail-fast, not silent misrouting)", () => {
  assert.throws(
    () =>
      new StrategyRunner({
        evmRpc: "https://example.invalid",
        signer: makeSigner(),
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
        chainId: 1,
      }),
    /Unsupported chainId 1/,
  );
});

test("compute router URL is chain-driven when AXIOM_COMPUTE_BASE_URL is unset (16602→Galileo, 16661→mainnet)", () => {
  const savedBase = process.env.AXIOM_COMPUTE_BASE_URL;
  const savedChain = process.env.AXIOM_CHAIN_ID;
  delete process.env.AXIOM_COMPUTE_BASE_URL;
  try {
    process.env.AXIOM_CHAIN_ID = "16602";
    assert.equal(
      getComputeBaseUrl(),
      "https://router-api-testnet.integratenetwork.work/v1",
    );
    process.env.AXIOM_CHAIN_ID = "16661";
    assert.equal(getComputeBaseUrl(), "https://router-api.0g.ai/v1");
    process.env.AXIOM_COMPUTE_BASE_URL = "https://explicit.example/v1";
    assert.equal(getComputeBaseUrl(), "https://explicit.example/v1");
  } finally {
    if (savedBase === undefined) delete process.env.AXIOM_COMPUTE_BASE_URL;
    else process.env.AXIOM_COMPUTE_BASE_URL = savedBase;
    if (savedChain === undefined) delete process.env.AXIOM_CHAIN_ID;
    else process.env.AXIOM_CHAIN_ID = savedChain;
  }
});
