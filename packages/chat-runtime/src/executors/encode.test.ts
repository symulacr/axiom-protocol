import { describe, it } from "bun:test";
import assert from "node:assert/strict";
import {
  encodeFunctionData,
  keccak256,
  parseAbi,
  parseUnits,
  toHex,
} from "viem";
import { PAYMENT_PROCESSOR_ABI } from "@axiom/config/abis";
import { runEncodeTool } from "./encode.js";
import type { ToolRuntime } from "../transport.js";

const PAY_ABI = parseAbi(PAYMENT_PROCESSOR_ABI);

function makeCtx(overrides: Partial<ToolRuntime> = {}): ToolRuntime {
  return {
    http: {
      fetch: async () => ({
        ok: true,
        status: 200,
        text: async () => "",
        json: async () => ({}),
      }),
    },
    wallet: { address: "0xwallet" as `0x${string}` },
    session: { chainId: 1 },
    mode: "sign",
    ...overrides,
  } as ToolRuntime;
}

/** Mock http that captures the POST body and returns a successful mint-encode response. */
function capturingCtx() {
  let sentBody: unknown;
  const ctx = makeCtx({
    http: {
      fetch: async (_path: string, init?: { body?: string }) => {
        sentBody = init?.body ? JSON.parse(init.body) : undefined;
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({ to: "0xabc", data: "0xdef", value: "0" }),
        };
      },
    },
  });
  return {
    ctx,
    getBody: () =>
      sentBody as { dataDescription?: string; dataHash?: string; to?: string },
  };
}

type CapturedCall = {
  path: string;
  method?: string;
  body?: { dataHash?: string; to?: string; dataDescription?: string };
};

function capturingAllCtx(oracleUrl = "http://oracle.test:8787") {
  const calls: CapturedCall[] = [];
  const ctx = makeCtx({
    oracleUrl,
    mode: "encode-only",
    http: {
      fetch: async (
        path: string,
        init?: { method?: string; body?: string },
      ) => {
        calls.push({
          path,
          method: init?.method,
          body: init?.body ? JSON.parse(init.body) : undefined,
        });
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              ok: true,
              to: "0xabc",
              data: "0xdef",
              value: "0",
            }),
        };
      },
    },
  });
  return {
    ctx,
    calls,
    oracleCall: () =>
      calls.find((c) => c.path.replace(/\/$/, "").endsWith("/v1/agents/mint")),
  };
}

describe("runEncodeTool", () => {
  it("mint_agent without dataDescription returns {ok:false}", async () => {
    const res = await runEncodeTool("mint_agent", {}, makeCtx());
    assert.equal(res.ok, false);
  });

  it("deposit without amount returns {ok:false}", async () => {
    const res = await runEncodeTool(
      "deposit",
      { tokenId: "1" },
      makeCtx({ session: { chainId: 1, lastTokenId: "1" } }),
    );
    assert.equal(res.ok, false);
  });

  it("mint_agent without dataHash derives dataHash from dataDescription (first-time-user gate)", async () => {
    const { ctx, getBody } = capturingCtx();
    const res = await runEncodeTool(
      "mint_agent",
      { dataDescription: "my first agent" },
      ctx,
    );
    assert.equal(
      res.ok,
      true,
      "first-time users must be able to mint without a dataHash",
    );
    const body = getBody();
    assert.equal(body.dataDescription, "my first agent");
    assert.equal(body.to, "0xwallet");
    assert.equal(
      body.dataHash,
      keccak256(toHex("my first agent")),
      "dataHash must be derived from the agent name when omitted",
    );
  });

  it("mint_agent with explicit dataHash passes it through unchanged", async () => {
    const { ctx, getBody } = capturingCtx();
    const explicit = ("0x" + "ab".repeat(32)) as `0x${string}`;
    const res = await runEncodeTool(
      "mint_agent",
      { dataDescription: "named agent", dataHash: explicit },
      ctx,
    );
    assert.equal(res.ok, true);
    assert.equal(
      getBody().dataHash,
      explicit,
      "explicit dataHash must not be re-derived",
    );
  });

  it("mint_agent registers the derived dataHash with the oracle (markDataHashSeen)", async () => {
    const { ctx, oracleCall } = capturingAllCtx();
    const res = await runEncodeTool(
      "mint_agent",
      { dataDescription: "chat agent" },
      ctx,
    );
    assert.equal(
      res.ok,
      true,
      "mint must still succeed when oracle is reachable",
    );

    const call = oracleCall();
    assert.ok(
      call,
      "chat mint MUST attempt oracle registration (POST /v1/agents/mint)",
    );
    assert.equal(call!.method, "POST");
    assert.equal(
      call!.body?.dataHash,
      keccak256(toHex("chat agent")),
      "oracle must be registered with the derived dataHash",
    );
    assert.equal(
      call!.body?.to,
      "0xwallet",
      "oracle must be registered with the minter address (to)",
    );
  });

  it("mint_agent with explicit dataHash registers it with the oracle", async () => {
    const { ctx, oracleCall } = capturingAllCtx();
    const explicit = ("0x" + "cd".repeat(32)) as `0x${string}`;
    const res = await runEncodeTool(
      "mint_agent",
      { dataDescription: "named agent", dataHash: explicit },
      ctx,
    );
    assert.equal(res.ok, true);
    const call = oracleCall();
    assert.ok(call, "oracle registration must be attempted");
    assert.equal(
      call!.body?.dataHash,
      explicit,
      "oracle must be registered with the explicit dataHash",
    );
  });

  it("mint_agent fails when oracle registration fails (fatal, matches UI wizard)", async () => {
    const oracleUrl = "http://oracle.test:8787";
    const ctx = makeCtx({
      oracleUrl,
      mode: "encode-only",
      http: {
        fetch: async (path: string) => {
          if (path.replace(/\/$/, "").endsWith("/v1/agents/mint")) {
            throw new Error("oracle unreachable");
          }
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({ to: "0xabc", data: "0xdef", value: "0" }),
          };
        },
      },
    });
    const res = await runEncodeTool(
      "mint_agent",
      { dataDescription: "resilient agent" },
      ctx,
    );
    assert.equal(
      res.ok,
      false,
      "a failed oracle registration must abort the mint — an unregistered hash makes the agent un-transferable later",
    );
  });
});

const PROCESSOR = ("0x" + "ee".repeat(20)) as `0x${string}`;
const PROVIDER = ("0x" + "dd".repeat(20)) as `0x${string}`;

function payCtx(overrides: Partial<ToolRuntime> = {}): ToolRuntime {
  return makeCtx({
    session: {
      chainId: 16602,
      lastTokenId: "3",
      addresses: {
        vault: "0xV" as `0x${string}`,
        agentNft: "0xN" as `0x${string}`,
        paymentProcessor: PROCESSOR,
      },
    },
    ...overrides,
  });
}

function payContent(res: {
  ok: boolean;
  content: string;
}): Record<string, unknown> {
  return JSON.parse(res.content) as Record<string, unknown>;
}

describe("runEncodeTool pay_for_agent", () => {
  it("rejects missing tokenId", async () => {
    const res = await runEncodeTool(
      "pay_for_agent",
      { agentAmount: "1.5" },
      payCtx({
        session: {
          chainId: 16602,
          addresses: {
            vault: "0xV" as `0x${string}`,
            agentNft: "0xN" as `0x${string}`,
            paymentProcessor: PROCESSOR,
          },
        },
      }),
    );
    assert.equal(res.ok, false);
    assert.match(payContent(res).error as string, /tokenId required/);
  });

  it("rejects missing agentAmount", async () => {
    const res = await runEncodeTool(
      "pay_for_agent",
      { tokenId: "3" },
      payCtx(),
    );
    assert.equal(res.ok, false);
    assert.match(payContent(res).error as string, /agentAmount/);
  });

  it("rejects zero agentAmount", async () => {
    const res = await runEncodeTool(
      "pay_for_agent",
      { tokenId: "3", agentAmount: "0" },
      payCtx(),
    );
    assert.equal(res.ok, false);
    assert.match(payContent(res).error as string, /agentAmount/);
  });

  it("rejects zero computeAmount", async () => {
    const res = await runEncodeTool(
      "pay_for_agent",
      {
        tokenId: "3",
        agentAmount: "1",
        computeAmount: "0",
        provider: PROVIDER,
      },
      payCtx(),
    );
    assert.equal(res.ok, false);
    assert.match(payContent(res).error as string, /computeAmount/);
  });

  it("rejects computeAmount without a provider (no registered provider)", async () => {
    const res = await runEncodeTool(
      "pay_for_agent",
      { tokenId: "3", agentAmount: "1", computeAmount: "0.5" },
      payCtx(),
    );
    assert.equal(res.ok, false);
    assert.match(payContent(res).error as string, /provider/);
  });

  it("rejects when wallet is not connected", async () => {
    const res = await runEncodeTool(
      "pay_for_agent",
      { tokenId: "3", agentAmount: "1.5" },
      payCtx({ wallet: {} }),
    );
    assert.equal(res.ok, false);
    assert.match(payContent(res).error as string, /Wallet not connected/);
  });

  it("rejects when payment processor address is not configured", async () => {
    const res = await runEncodeTool(
      "pay_for_agent",
      { tokenId: "3", agentAmount: "1.5" },
      payCtx({ session: { chainId: 16602, lastTokenId: "3" } }),
    );
    assert.equal(res.ok, false);
    assert.match(payContent(res).error as string, /Payment processor/);
  });

  it("encodes creator-only payForAgent when computeAmount omitted (encode-only)", async () => {
    const res = await runEncodeTool(
      "pay_for_agent",
      { tokenId: "3", agentAmount: "1.5" },
      payCtx({ mode: "encode-only" }),
    );
    assert.equal(res.ok, true);
    const content = payContent(res);
    assert.equal(content.to, PROCESSOR);
    assert.equal(
      content.data,
      encodeFunctionData({
        abi: PAY_ABI,
        functionName: "payForAgent",
        args: [3n, parseUnits("1.5", 6)],
      }),
      "creator-only payment must encode payForAgent(tokenId, amount)",
    );
  });

  it("encodes payForAgentAndCompute with provider when computeAmount given (encode-only)", async () => {
    const res = await runEncodeTool(
      "pay_for_agent",
      {
        tokenId: "3",
        agentAmount: "1.5",
        computeAmount: "0.5",
        provider: PROVIDER,
      },
      payCtx({ mode: "encode-only" }),
    );
    assert.equal(res.ok, true);
    const content = payContent(res);
    assert.equal(content.to, PROCESSOR);
    assert.equal(
      content.data,
      encodeFunctionData({
        abi: PAY_ABI,
        functionName: "payForAgentAndCompute",
        args: [3n, PROVIDER, parseUnits("1.5", 6), parseUnits("0.5", 6)],
      }),
      "combined payment must encode payForAgentAndCompute(tokenId, provider, agentAmount, computeAmount)",
    );
  });

  it("signs and reports receipt confirmation when the transport waits", async () => {
    const sent: Array<{ to: string; data: string; value: bigint }> = [];
    const res = await runEncodeTool(
      "pay_for_agent",
      {
        tokenId: "3",
        agentAmount: "2",
        computeAmount: "1",
        provider: PROVIDER,
      },
      payCtx({
        wallet: {
          address: "0xwallet" as `0x${string}`,
          signAndSend: async (calldata) => {
            sent.push(calldata as { to: string; data: string; value: bigint });
            return ("0x" + "11".repeat(32)) as `0x${string}`;
          },
          waitForReceipt: async () => ({
            status: "success" as const,
            blockNumber: 123456n,
          }),
        },
      }),
    );
    assert.equal(res.ok, true);
    const content = payContent(res);
    assert.equal(content.txHash, "0x" + "11".repeat(32));
    assert.equal(content.receiptStatus, "success");
    assert.equal(content.blockNumber, "123456");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, PROCESSOR);
    assert.equal(
      sent[0].data,
      encodeFunctionData({
        abi: PAY_ABI,
        functionName: "payForAgentAndCompute",
        args: [3n, PROVIDER, parseUnits("2", 6), parseUnits("1", 6)],
      }),
    );
  });

  it("falls back to txHash-only when the transport has no receipt wait", async () => {
    const res = await runEncodeTool(
      "pay_for_agent",
      { tokenId: "3", agentAmount: "1.5" },
      payCtx({
        wallet: {
          address: "0xwallet" as `0x${string}`,
          signAndSend: async () => ("0x" + "22".repeat(32)) as `0x${string}`,
        },
      }),
    );
    assert.equal(res.ok, true);
    const content = payContent(res);
    assert.equal(content.txHash, "0x" + "22".repeat(32));
    assert.equal(content.receiptStatus, undefined);
  });
});
