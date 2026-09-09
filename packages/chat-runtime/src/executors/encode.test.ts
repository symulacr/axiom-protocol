import { describe, it } from "bun:test";
import assert from "node:assert/strict";
import { encodeFunctionData, parseAbi, parseUnits } from "viem";
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
      sentBody as { name?: string; to?: string; dataHash?: string },
  };
}

type CapturedCall = {
  path: string;
  method?: string;
  body?: { name?: string; to?: string; dataHash?: string };
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

  it("mint_agent posts the hashless { name, to } shape (server derives dataHash)", async () => {
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
    assert.equal(body.name, "my first agent");
    assert.equal(body.to, "0xwallet");
    assert.equal(
      body.dataHash,
      undefined,
      "client must not derive dataHash — the server derives it from the name",
    );
  });

  it("mint_agent posts the trimmed name (server derives from the trimmed form)", async () => {
    const { ctx, getBody } = capturingCtx();
    const res = await runEncodeTool(
      "mint_agent",
      { dataDescription: "  named agent  " },
      ctx,
    );
    assert.equal(res.ok, true);
    assert.equal(getBody().name, "named agent");
    assert.equal(getBody().to, "0xwallet");
  });

  it("mint_agent makes no separate oracle registration call (server-side)", async () => {
    const { ctx, calls } = capturingAllCtx();
    const res = await runEncodeTool(
      "mint_agent",
      { dataDescription: "chat agent" },
      ctx,
    );
    assert.equal(res.ok, true);
    assert.equal(
      calls.filter((c) => c.path.includes("/v1/agents/mint")).length,
      1,
      "exactly one request: POST /v1/agents/mint/encode with the hashless body — no separate oracle round-trip",
    );
    const call = calls[0];
    assert.match(call.path, /\/v1\/agents\/mint\/encode$/);
    assert.equal(call.method, "POST");
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
        args: [3n, parseUnits("1.5", 18)],
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
        args: [3n, PROVIDER, parseUnits("1.5", 18), parseUnits("0.5", 18)],
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
        args: [3n, PROVIDER, parseUnits("2", 18), parseUnits("1", 18)],
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

const STRATEGY_VAULT = ("0x" + "aa".repeat(20)) as `0x${string}`;
const LIVE_ROOT = "0x" + "bb".repeat(32);

describe("runEncodeTool set_strategy (P1: real relay route /v1/agents/:id/set-strategy)", () => {
  function strategyCtx(extra: Record<string, unknown> = {}) {
    const calls: Array<{ path: string; body?: Record<string, unknown> }> = [];
    const reads: string[] = [];
    const ctx = {
      mode: "encode-only",
      wallet: { address: "0xwallet" as `0x${string}` },
      session: {
        chainId: 16602,
        lastTokenId: "7",
        addresses: {
          vault: STRATEGY_VAULT,
          agentNft: "0xN" as `0x${string}`,
        },
      },
      chain: {
        chainId: 16602,
        readContract: async (req: { functionName: string }) => {
          reads.push(req.functionName);
          return [LIVE_ROOT, 0n, 0n, 0n, 12345n];
        },
      },
      http: {
        fetch: async (path: string, init?: { body?: string }) => {
          calls.push({
            path,
            body: init?.body ? JSON.parse(init.body) : undefined,
          });
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({ to: "0xabc", data: "0xdef", value: "0" }),
            json: async () => ({}),
          };
        },
      },
      ...extra,
    } as unknown as ToolRuntime;
    return { ctx, calls, reads };
  }

  it("prefills omitted root/expiry from the live strategyOf tuple", async () => {
    const { ctx, calls, reads } = strategyCtx();
    const res = await runEncodeTool("set_strategy", { dailyLimit: "1.5" }, ctx);
    assert.equal(res.ok, true);
    assert.deepEqual(reads, ["strategyOf"]);
    const post = calls.find((c) => c.path === "/v1/agents/7/set-strategy");
    assert.ok(post, "relay route called with the session tokenId");
    assert.deepEqual(
      post!.body,
      { root: LIVE_ROOT, dailyLimit: "1.5", validUntilDay: "12345" },
      "omitted fields keep the live strategy, so a limit refresh never clears the Merkle root",
    );
    const content = payContent(res);
    assert.equal(content.encodeOnly, true);
    assert.equal(content.to, "0xabc");
  });

  it("explicit root and validUntilDay win and skip the chain read", async () => {
    const { ctx, calls, reads } = strategyCtx();
    const explicit = "0x" + "cc".repeat(32);
    const res = await runEncodeTool(
      "set_strategy",
      { tokenId: "9", dailyLimit: "2", root: explicit, validUntilDay: "0" },
      ctx,
    );
    assert.equal(res.ok, true);
    assert.deepEqual(
      reads,
      [],
      "no strategyOf read when both fields are given",
    );
    const post = calls.find((c) => c.path === "/v1/agents/9/set-strategy");
    assert.deepEqual(post!.body, {
      root: explicit,
      dailyLimit: "2",
      validUntilDay: "0",
    });
  });

  it("rejects missing, zero, or over-cap dailyLimit", async () => {
    for (const dailyLimit of [undefined, "0", "1001"]) {
      const res = await runEncodeTool(
        "set_strategy",
        dailyLimit === undefined ? {} : { dailyLimit },
        strategyCtx().ctx,
      );
      assert.equal(res.ok, false, `dailyLimit ${dailyLimit}`);
      assert.match(payContent(res).error as string, /dailyLimit/);
    }
  });

  it("rejects malformed root and validUntilDay", async () => {
    const bad = await runEncodeTool(
      "set_strategy",
      { dailyLimit: "1", root: "0x1234" },
      strategyCtx().ctx,
    );
    assert.equal(bad.ok, false);
    assert.match(payContent(bad).error as string, /root/);
    const badDay = await runEncodeTool(
      "set_strategy",
      { dailyLimit: "1", validUntilDay: "tomorrow" },
      strategyCtx().ctx,
    );
    assert.equal(badDay.ok, false);
    assert.match(payContent(badDay).error as string, /validUntilDay/);
  });

  it("fails honestly when the relay route errors", async () => {
    const { ctx } = strategyCtx({
      http: {
        fetch: async () => ({
          ok: false,
          status: 400,
          text: async () => JSON.stringify({ error: "invalid" }),
          json: async () => ({}),
        }),
      },
    });
    const res = await runEncodeTool("set_strategy", { dailyLimit: "1" }, ctx);
    assert.equal(res.ok, false);
    assert.match(payContent(res).error as string, /set_strategy encode fail/);
  });

  it("never enters the sponsor lane (wallet-lane only op)", async () => {
    let sponsored = false;
    const { ctx } = strategyCtx({
      mode: "sign",
      wallet: {
        address: "0xwallet" as `0x${string}`,
        signAndSend: async () => ("0x" + "33".repeat(32)) as `0x${string}`,
        sponsor: async () => {
          sponsored = true;
          return { signature: ("0x" + "44".repeat(65)) as `0x${string}` };
        },
      },
    });
    const res = await runEncodeTool("set_strategy", { dailyLimit: "1" }, ctx);
    assert.equal(res.ok, true);
    assert.equal(sponsored, false, "set_strategy is not in SPONSORED_TOOLS");
    assert.equal(payContent(res).txHash, "0x" + "33".repeat(32));
  });
});
