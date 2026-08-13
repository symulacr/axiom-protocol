import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  Wallet,
  JsonRpcProvider,
  Interface,
  FetchRequest,
  keccak256,
} from "ethers";
import {
  StrategyRunner,
  parseRecommendation,
  settlementSkipReason,
  type MarketSignal,
  type StrategySpec,
} from "./index.js";
import { STRATEGY_OF_CURRENT } from "@axiom/config/abis";
import { ZERO_DATA_ROOT } from "@axiom/config/constants";

const ZERO_ROOT =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

const SIGNER_PRIV = "0x" + "33".repeat(32);
const NFT_ADDR = ("0x" + "00".repeat(19) + "01") as `0x${string}`;
const VAULT_ADDR = ("0x" + "00".repeat(19) + "02") as `0x${string}`;
const NON_ZERO_ROOT = "0x" + "cd".repeat(32);
const ACT_OUTPUT = JSON.stringify({
  action: "act",
  confidence: 0.9,
  reason: "signal up",
});

const strategyOfIface = new Interface(STRATEGY_OF_CURRENT);
const balanceOfIface = new Interface([
  "function balanceOf(uint256) view returns (uint256)",
]);
const strategyOfSelector = strategyOfIface.getFunction("strategyOf")!.selector;
const balanceOfSelector = balanceOfIface.getFunction("balanceOf")!.selector;

function makeSigner(provider?: JsonRpcProvider): Wallet {
  const wallet = new Wallet(SIGNER_PRIV);
  return provider ? wallet.connect(provider) : wallet;
}

function makeStrategy(overrides: Partial<StrategySpec> = {}): StrategySpec {
  return {
    agentTokenId: 7n,
    agentNft: NFT_ADDR,
    vault: VAULT_ADDR,
    computeModel: "openai/gpt-4o",
    systemPrompt: "You are a vault manager.",
    modelDataRoot: "0x" + "ee".repeat(32),
    ...overrides,
  } as StrategySpec;
}

type RpcStub = (method: string, params: unknown[]) => unknown;

function vaultRpc(root: string, balance = 1n): RpcStub {
  const from = makeSigner().address;
  return (method, params) => {
    switch (method) {
      case "eth_call": {
        const data = ((params[0] as { data?: string })?.data ?? "0x").slice(
          0,
          10,
        );
        if (data === strategyOfSelector) {
          return strategyOfIface.encodeFunctionResult("strategyOf", [
            root,
            1_000_000n,
            0n,
            0,
            0,
          ]);
        }
        if (data === balanceOfSelector) {
          return balanceOfIface.encodeFunctionResult("balanceOf", [balance]);
        }
        return "0x";
      }
      case "eth_blockNumber":
        return "0x64";
      case "eth_chainId":
        return "0x411d";
      case "eth_getLogs":
        return [];
      case "eth_getTransactionCount":
        return "0x1";
      case "eth_gasPrice":
        return "0x1";
      case "eth_maxPriorityFeePerGas":
        return "0x1";
      case "eth_getBlockByNumber":
        return {
          number: "0x64",
          hash: "0x" + "cc".repeat(32),
          parentHash: "0x" + "dd".repeat(32),
          nonce: "0x0000000000000000",
          sha3Uncles: "0x" + "ee".repeat(32),
          logsBloom: "0x" + "00".repeat(256),
          transactionsRoot: "0x" + "ff".repeat(32),
          stateRoot: "0x" + "11".repeat(32),
          receiptsRoot: "0x" + "22".repeat(32),
          miner: "0x" + "00".repeat(20),
          difficulty: "0x0",
          totalDifficulty: "0x0",
          extraData: "0x",
          size: "0x1",
          gasLimit: "0x1c9c380",
          gasUsed: "0x5208",
          timestamp: "0x64",
          transactions: [],
          uncles: [],
          baseFeePerGas: "0x1",
          mixHash: "0x" + "33".repeat(32),
        };
      case "eth_estimateGas":
        return "0x5208";
      case "eth_sendTransaction":
      case "eth_sendRawTransaction":
        return keccak256(params[0] as string);
      case "eth_getTransactionReceipt": {
        const txHash = params[0] as string;
        return {
          transactionHash: txHash,
          transactionIndex: "0x0",
          blockHash: "0x" + "bb".repeat(32),
          blockNumber: "0x64",
          from,
          to: VAULT_ADDR,
          cumulativeGasUsed: "0x5208",
          gasUsed: "0x5208",
          contractAddress: null,
          logs: [],
          logsBloom: "0x" + "00".repeat(256),
          status: "0x1",
          effectiveGasPrice: "0x1",
        };
      }
      default:
        return null;
    }
  };
}

/**
 * Stubs both network boundaries the runner touches: ethers' JSON-RPC transport
 * (Node http/https via FetchRequest.getUrlFunc) and the OpenAI chat-completions
 * client (global fetch). No real network is ever hit.
 */
async function withHttpStub(
  rpc: RpcStub,
  chatContent: string,
  fn: () => Promise<void>,
): Promise<void> {
  const prevFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url =
      input instanceof Request ? new URL(input.url) : new URL(String(input));
    if (url.pathname.endsWith("/chat/completions")) {
      return new Response(
        JSON.stringify({
          id: "cmpl-test",
          object: "chat.completion",
          created: 1,
          model: "test",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: chatContent },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("unexpected http call", { status: 404 });
  }) as typeof fetch;
  FetchRequest.registerGetUrl(async (req) => {
    const body = req.body
      ? (JSON.parse(new TextDecoder().decode(req.body)) as
          | { method?: string; params?: unknown[]; id?: number }
          | Array<{ method?: string; params?: unknown[]; id?: number }>)
      : null;
    const respond = (
      p: { method?: string; params?: unknown[]; id?: number } | null,
    ) => ({
      jsonrpc: "2.0",
      id: p?.id ?? 0,
      result: rpc(p?.method ?? "", p?.params ?? []),
    });
    // JsonRpcProvider batches concurrent sends into an array payload.
    const results = Array.isArray(body) ? body.map(respond) : respond(body);
    return {
      statusCode: 200,
      statusMessage: "OK",
      headers: { "content-type": "application/json" },
      body: new TextEncoder().encode(JSON.stringify(results)),
    };
  });
  try {
    await fn();
  } finally {
    globalThis.fetch = prevFetch;
    FetchRequest.registerGetUrl(FetchRequest.createGetUrlFunc());
  }
}

const COMPUTE_KEY = "AXIOM_COMPUTE_DIRECT_KEY";
const COMPUTE_URL = "AXIOM_COMPUTE_DIRECT_URL";

function withDirectComputeEnv(fn: () => Promise<void>): () => Promise<void> {
  return async () => {
    const prevKey = process.env[COMPUTE_KEY];
    const prevUrl = process.env[COMPUTE_URL];
    process.env[COMPUTE_KEY] = "test-key";
    process.env[COMPUTE_URL] = "http://127.0.0.1:1/v1/proxy";
    try {
      await fn();
    } finally {
      if (prevKey === undefined) delete process.env[COMPUTE_KEY];
      else process.env[COMPUTE_KEY] = prevKey;
      if (prevUrl === undefined) delete process.env[COMPUTE_URL];
      else process.env[COMPUTE_URL] = prevUrl;
    }
  };
}

test("parseRecommendation maps 'act' action to act", () => {
  const rec = parseRecommendation('{"action":"act","reason":"go"}');
  assert.equal(rec.action, "act");
});

test("parseRecommendation falls back to hold for unknown action 'buy'", () => {
  const rec = parseRecommendation('{"action":"buy","reason":"x"}');
  assert.equal(rec.action, "hold");
});

test("parseRecommendation falls back to hold for unparseable output", () => {
  const rec = parseRecommendation("not json");
  assert.equal(rec.action, "hold");
});

test("settlementSkipReason reports no strategy set for zero root", () => {
  const reason = settlementSkipReason(ZERO_ROOT);
  assert.ok(reason.includes("no strategy set"), `reason was: ${reason}`);
});

test("settlementSkipReason reports Merkle proof producer requirement for non-zero root", () => {
  const reason = settlementSkipReason("0xabc");
  assert.ok(reason.includes("Merkle proof producer"), `reason was: ${reason}`);
});

test("StrategyRunner.runTick with manual:e2e-mock skips inference and reports a hold tick", async () => {
  const runner = new StrategyRunner({
    evmRpc: "http://127.0.0.1:1",
    signer: makeSigner(),
    chainId: 16661,
  });
  const strategy = makeStrategy();
  const signal: MarketSignal = {
    source: "manual:e2e-mock",
    payload: {},
    emittedAt: Date.now(),
  };
  const chunks: unknown[] = [];
  const result = await runner.runTick(strategy, signal, (c) => chunks.push(c));

  assert.equal(result.recommendation.action, "hold");
  assert.equal(result.execution, undefined, "hold never settles");
  assert.equal(result.onchain.vaultBalance, 0n);
  assert.deepEqual(result.onchain.recentEvents, []);
  assert.equal(result.storage.rootHash, strategy.modelDataRoot);
  assert.equal(result.storage.size, 0);
  assert.ok(result.durationMs >= 0);
  const complete = chunks.at(-1) as { type?: string; result?: unknown };
  assert.equal(complete.type, "complete");
  assert.ok(
    typeof complete.result === "object" && complete.result !== null,
    "complete chunk carries the TickResult",
  );
});

test(
  "StrategyRunner.runTick with an act recommendation and no executionPlan skips settlement",
  withDirectComputeEnv(async () => {
    const provider = new JsonRpcProvider("http://127.0.0.1:1", 16661, {
      staticNetwork: true,
    });
    const runner = new StrategyRunner({
      evmRpc: "http://127.0.0.1:1",
      signer: makeSigner(provider),
      addresses: { vault: VAULT_ADDR },
      chainId: 16661,
    });
    const signal: MarketSignal = {
      source: "market:test",
      payload: { trend: "up" },
      emittedAt: Date.now(),
    };
    await withHttpStub(vaultRpc(NON_ZERO_ROOT), ACT_OUTPUT, async () => {
      const result = await runner.runTick(makeStrategy(), signal);
      assert.equal(result.recommendation.action, "act");
      assert.equal(result.recommendation.confidence, 0.9);
      assert.equal(result.onchain.vaultBalance, 1n);
      assert.equal(result.execution?.status, "skipped");
      assert.ok(
        result.execution?.reason?.includes("Merkle proof producer"),
        `reason was: ${result.execution?.reason}`,
      );
    });
  }),
);

test(
  "StrategyRunner.runTick skips settlement when the vault strategy root is zero",
  withDirectComputeEnv(async () => {
    const provider = new JsonRpcProvider("http://127.0.0.1:1", 16661, {
      staticNetwork: true,
    });
    const runner = new StrategyRunner({
      evmRpc: "http://127.0.0.1:1",
      signer: makeSigner(provider),
      addresses: { vault: VAULT_ADDR },
      chainId: 16661,
    });
    const strategy = makeStrategy({
      executionPlan: {
        target: NFT_ADDR,
        value: 1n,
        data: "0x",
        merkleProof: [("0x" + "aa".repeat(32)) as `0x${string}`],
      },
    });
    const signal: MarketSignal = {
      source: "market:test",
      payload: {},
      emittedAt: Date.now(),
    };
    await withHttpStub(vaultRpc(ZERO_DATA_ROOT), ACT_OUTPUT, async () => {
      const result = await runner.runTick(strategy, signal);
      assert.equal(result.recommendation.action, "act");
      assert.equal(result.execution?.status, "skipped");
      assert.equal(result.execution?.reason, "no strategy root set on vault");
    });
  }),
);

test(
  "StrategyRunner.runTick executes the vault plan on-chain for an act recommendation",
  withDirectComputeEnv(async () => {
    const provider = new JsonRpcProvider("http://127.0.0.1:1", 16661, {
      staticNetwork: true,
    });
    const runner = new StrategyRunner({
      evmRpc: "http://127.0.0.1:1",
      signer: makeSigner(provider),
      addresses: { vault: VAULT_ADDR },
      chainId: 16661,
    });
    const strategy = makeStrategy({
      executionPlan: {
        target: NFT_ADDR,
        value: 0n,
        data: "0x1234",
        merkleProof: [("0x" + "aa".repeat(32)) as `0x${string}`],
      },
    });
    const signal: MarketSignal = {
      source: "market:test",
      payload: { trend: "up" },
      emittedAt: Date.now(),
    };
    await withHttpStub(vaultRpc(NON_ZERO_ROOT), ACT_OUTPUT, async () => {
      const result = await runner.runTick(strategy, signal);
      assert.equal(result.recommendation.action, "act");
      assert.equal(result.execution?.status, "executed");
      assert.equal(result.execution?.success, true);
      assert.match(
        result.execution?.txHash ?? "",
        /^0x[0-9a-fA-F]{64}$/,
        "execution carries the broadcast tx hash",
      );
      assert.equal(result.execution?.action, "act");
      assert.equal(result.execution?.target, NFT_ADDR);
    });
  }),
);
