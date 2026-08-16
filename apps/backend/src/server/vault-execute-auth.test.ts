import assert from "node:assert/strict";
import { test } from "bun:test";
import type { Request, Response } from "express";
import {
  Wallet,
  JsonRpcProvider,
  Interface,
  FetchRequest,
  keccak256,
} from "ethers";
import { PaymentProcessorClient } from "../payment/processor.js";
import { ERC20_ABI, PAYMENT_PROCESSOR_ABI } from "@axiom/config/abis";
import {
  createApiKeyAuth,
  requireServerAuth,
  type AuthRequest,
} from "@axiom/config/middleware/auth";

function mockRes() {
  const state: { statusCode?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    },
  } as unknown as Response;
  return { res, state };
}

/** Builds a request that already passed the api-key middleware with `apiKey`. */
function makeAuthedReq(apiKey: string): AuthRequest {
  const auth = createApiKeyAuth(
    "server-secret",
    ["/health"],
    false,
    "browser-key",
  );
  const req = {
    path: "/v1/vaults/1/execute",
    headers: { "x-api-key": apiKey },
  } as unknown as AuthRequest;
  auth(req as Request, mockRes().res, () => {});
  return req;
}

test("client key cannot pass requireServerAuth (vault execute gate)", () => {
  const req = makeAuthedReq("browser-key");
  assert.equal(req.authPrincipal, "client");
  const { res, state } = mockRes();
  let next = false;
  requireServerAuth(req as Request, res, () => {
    next = true;
  });
  assert.equal(next, false);
  assert.equal(state.statusCode, 403);
});

test("server key passes requireServerAuth", () => {
  const req = makeAuthedReq("server-secret");
  assert.equal(req.authPrincipal, "server");
  let next = false;
  requireServerAuth(req as Request, mockRes().res, () => {
    next = true;
  });
  assert.equal(next, true);
});

const PAYMENT_PRIV = "0x" + "44".repeat(32);
const PROCESSOR_ADDR = ("0x" + "00".repeat(19) + "04") as `0x${string}`;
const TOKEN_ADDR = ("0x" + "00".repeat(19) + "05") as `0x${string}`;
const CREATOR = ("0x" + "00".repeat(19) + "06") as `0x${string}`;

const paymentIface = new Interface(PAYMENT_PROCESSOR_ABI);
const erc20Iface = new Interface(ERC20_ABI);
const allowanceSelector = erc20Iface.getFunction("allowance")!.selector;

type RpcStub = (method: string, params: unknown[]) => unknown;

interface PaymentRpcOptions {
  allowance: bigint;
  tokenId: bigint;
  amount: bigint;
  payer: string;
  creator: string;
}

function paymentRpc(opts: PaymentRpcOptions): {
  rpc: RpcStub;
  sends: () => number;
} {
  let sends = 0;
  const { topics, data } = paymentIface.encodeEventLog("PaymentProcessed", [
    opts.tokenId,
    opts.payer,
    opts.creator,
    opts.amount,
    (opts.amount * 8n) / 10n,
    (opts.amount * 2n) / 10n,
  ]);
  const rpc: RpcStub = (method, params) => {
    switch (method) {
      case "eth_call": {
        const calldata = ((params[0] as { data?: string })?.data ?? "0x").slice(
          0,
          10,
        );
        if (calldata === allowanceSelector) {
          return erc20Iface.encodeFunctionResult("allowance", [opts.allowance]);
        }
        return "0x";
      }
      case "eth_blockNumber":
        return "0x64";
      case "eth_chainId":
        return "0x411d";
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
        sends++;
        return keccak256(params[0] as string);
      case "eth_getTransactionReceipt": {
        const txHash = params[0] as string;
        return {
          transactionHash: txHash,
          transactionIndex: "0x0",
          blockHash: "0x" + "bb".repeat(32),
          blockNumber: "0x64",
          from: new Wallet(PAYMENT_PRIV).address,
          to: PROCESSOR_ADDR,
          cumulativeGasUsed: "0x5208",
          gasUsed: "0x5208",
          contractAddress: null,
          logs: [
            {
              address: PROCESSOR_ADDR,
              topics,
              data,
              blockNumber: "0x64",
              transactionHash: txHash,
              transactionIndex: "0x0",
              blockHash: "0x" + "bb".repeat(32),
              logIndex: "0x0",
              removed: false,
            },
          ],
          logsBloom: "0x" + "00".repeat(256),
          status: "0x1",
          effectiveGasPrice: "0x1",
        };
      }
      default:
        return null;
    }
  };
  return { rpc, sends: () => sends };
}

/** Stub ethers' JSON-RPC transport (Node http/https via FetchRequest.getUrlFunc). */
async function withEthersStub(
  rpc: RpcStub,
  fn: () => Promise<void>,
): Promise<void> {
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
    FetchRequest.registerGetUrl(FetchRequest.createGetUrlFunc());
  }
}

function makePaymentClient(): PaymentProcessorClient {
  const wallet = new Wallet(PAYMENT_PRIV);
  const provider = new JsonRpcProvider("http://127.0.0.1:1", 16661, {
    staticNetwork: true,
  });
  return new PaymentProcessorClient({
    address: PROCESSOR_ADDR,
    signer: wallet.connect(provider),
    provider,
    paymentTokenAddress: TOKEN_ADDR,
  });
}

test("payForAgent approves a zero allowance, pays, and parses the PaymentProcessed event", async () => {
  const wallet = new Wallet(PAYMENT_PRIV);
  const { rpc, sends } = paymentRpc({
    allowance: 0n,
    tokenId: 1n,
    amount: 100n,
    payer: wallet.address,
    creator: CREATOR,
  });
  const client = makePaymentClient();
  await withEthersStub(rpc, async () => {
    const { receipt, event } = await client.payForAgent(1n, 100n);
    assert.equal(sends(), 2, "exact-amount approve + payForAgent broadcast");
    assert.equal(receipt.status, 1);
    assert.ok(event, "PaymentProcessed event must be parsed from the receipt");
    assert.equal(event?.agentTokenId, 1n);
    assert.equal(event?.payer.toLowerCase(), wallet.address.toLowerCase());
    assert.equal(event?.creator.toLowerCase(), CREATOR.toLowerCase());
    assert.equal(event?.amount, 100n);
    assert.equal(event?.creatorCut, 80n);
    assert.equal(event?.protocolCut, 20n);
  });
});

test("payForAgent skips the approve broadcast when allowance already covers the amount", async () => {
  const wallet = new Wallet(PAYMENT_PRIV);
  const { rpc, sends } = paymentRpc({
    allowance: 500n,
    tokenId: 2n,
    amount: 100n,
    payer: wallet.address,
    creator: CREATOR,
  });
  const client = makePaymentClient();
  await withEthersStub(rpc, async () => {
    const { event } = await client.payForAgent(2n, 100n);
    assert.equal(sends(), 1, "only payForAgent is broadcast, no approve");
    assert.equal(event?.agentTokenId, 2n);
    assert.equal(event?.amount, 100n);
  });
});
