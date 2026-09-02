import { describe, it } from "bun:test";
import assert from "node:assert/strict";
import { runEncodeTool } from "./encode.js";
import { runReadTool } from "./read.js";
import { parseAbi, encodeFunctionData } from "viem";
import { PAYMENT_PROCESSOR_ABI } from "@axiom/config/abis";
import type {
  ToolRuntime,
  SponsorRequest,
  SponsorSubmitResult,
} from "../transport.js";

const PAY_ABI = parseAbi(PAYMENT_PROCESSOR_ABI);

const WALLET = "0x9999999999999999999999999999999999999999" as `0x${string}`;
const PROCESSOR = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`;
const VAULT = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as `0x${string}`;
const GAS_TANK = "0xcccccccccccccccccccccccccccccccccccccccc" as `0x${string}`;

interface HttpCall {
  path: string;
  method?: string;
  body?: Record<string, unknown>;
}

type FetchResponder = (
  path: string,
  init?: { method?: string; body?: string },
) => Promise<{ ok: boolean; status: number; text: string }>;

function makeCtx(opts: {
  mode?: "encode-only" | "sign";
  respond?: FetchResponder;
  sponsor?: (req: SponsorRequest) => Promise<SponsorSubmitResult>;
  signAndSend?: () => Promise<`0x${string}`>;
  chainRead?: (req: {
    functionName: string;
    args?: readonly unknown[];
  }) => Promise<unknown>;
}): ToolRuntime {
  return {
    mode: opts.mode ?? "sign",
    http: {
      fetch: async (
        path: string,
        init?: { method?: string; body?: string },
      ) => {
        const responder =
          opts.respond ??
          (async (p: string) => {
            if (p.startsWith("/v1/relayer/tank/")) {
              return {
                ok: true,
                status: 200,
                text: JSON.stringify({
                  address: WALLET,
                  balance: "0",
                  grantsLeft: "2",
                  gasGrant: "10000000000000000",
                  nextNonce: "7",
                }),
              };
            }
            if (p === "/v1/agents/5/withdraw" || p === "/v1/payment/config") {
              return {
                ok: true,
                status: 200,
                text: JSON.stringify({
                  to: VAULT,
                  data: "0xdeadbeef",
                  value: "0",
                }),
              };
            }
            return { ok: true, status: 200, text: JSON.stringify({}) };
          });
        const r = await responder(path, init);
        return {
          ok: r.ok,
          status: r.status,
          text: async () => r.text,
          json: async () => JSON.parse(r.text),
        };
      },
    },
    wallet: {
      address: WALLET,
      ...(opts.sponsor ? { sponsor: opts.sponsor } : {}),
      ...(opts.signAndSend ? { signAndSend: opts.signAndSend } : {}),
    },
    chain: opts.chainRead
      ? ({ readContract: opts.chainRead } as ToolRuntime["chain"])
      : undefined,
    session: {
      chainId: 16602,
      walletAddress: WALLET,
      lastTokenId: "5",
      addresses: {
        vault: VAULT,
        agentNft: PROCESSOR,
        paymentProcessor: PROCESSOR,
        gasTank: GAS_TANK,
      },
    },
  } as ToolRuntime;
}

/** HTTP mock with a call log + programmatic per-path responses. */
function loggingCtx(opts: Parameters<typeof makeCtx>[0]) {
  const calls: HttpCall[] = [];
  const ctx = makeCtx({
    ...opts,
    respond: async (path, init) => {
      calls.push({
        path,
        method: init?.method,
        body: init?.body
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : undefined,
      });
      if (opts.respond) return opts.respond(path, init);
      if (path.startsWith("/v1/relayer/tank/")) {
        return {
          ok: true,
          status: 200,
          text: JSON.stringify({
            address: WALLET,
            balance: "0",
            grantsLeft: "2",
            gasGrant: "10000000000000000",
            nextNonce: "7",
          }),
        };
      }
      if (path === "/v1/relayer/sponsor") {
        return {
          ok: true,
          status: 202,
          text: JSON.stringify({
            ok: true,
            id: "rel-1",
            nonce: "7",
            sponsored: true,
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: JSON.stringify({ to: VAULT, data: "0xdeadbeef", value: "0" }),
      };
    },
  });
  return { ctx, calls };
}

describe("encode sponsor lane (V3 W5-B §2.3)", () => {
  it("withdraw routes through the sponsor lane when the tank has headroom", async () => {
    const sponsorCalls: SponsorRequest[] = [];
    const { ctx, calls } = loggingCtx({
      sponsor: async (req) => {
        sponsorCalls.push(req);
        return { signature: ("0x" + "77".repeat(65)) as `0x${string}` };
      },
    });
    const result = await runEncodeTool(
      "withdraw",
      { tokenId: "5", amount: "0.5" },
      ctx,
    );
    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    assert.equal(result.ok, true);
    assert.equal(parsed.sponsored, true);
    assert.equal(parsed.relayerNonce, "7");
    assert.equal(parsed.relayerId, "rel-1");
    assert.equal(parsed.amount, "0.5");
    assert.equal(sponsorCalls.length, 1);
    assert.equal(sponsorCalls[0]!.nonce, 7n);
    assert.ok(
      sponsorCalls[0]!.deadline > BigInt(Math.floor(Date.now() / 1000)),
    );
    const paths = calls.map((c) => c.path);
    assert.ok(paths.includes("/v1/relayer/tank/" + WALLET), "reads tank first");
    assert.ok(paths.includes("/v1/relayer/sponsor"), "submits sponsor request");
  });

  it("pay_for_agent routes through the sponsor lane", async () => {
    const { ctx, calls } = loggingCtx({
      sponsor: async () => ({
        signature: ("0x" + "77".repeat(65)) as `0x${string}`,
      }),
    });
    const result = await runEncodeTool(
      "pay_for_agent",
      { tokenId: "5", agentAmount: "1.5" },
      ctx,
    );
    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    assert.equal(result.ok, true);
    assert.equal(parsed.sponsored, true);
    assert.ok(calls.some((c) => c.path === "/v1/relayer/sponsor"));
  });

  it("402 TANK_EXHAUSTED from the relayer → terminal toolFail with remedy", async () => {
    const { ctx } = loggingCtx({
      respond: async (path) => {
        if (path.startsWith("/v1/relayer/tank/")) {
          return {
            ok: true,
            status: 200,
            text: JSON.stringify({
              address: WALLET,
              balance: "0",
              grantsLeft: "0",
              nextNonce: "7",
            }),
          };
        }
        if (path.startsWith("/v1/agents/")) {
          return {
            ok: true,
            status: 200,
            text: JSON.stringify({ to: VAULT, data: "0xdeadbeef", value: "0" }),
          };
        }
        return { ok: true, status: 200, text: "{}" };
      },
      sponsor: async () => ({
        signature: ("0x" + "77".repeat(65)) as `0x${string}`,
      }),
    });
    const result = await runEncodeTool(
      "withdraw",
      { tokenId: "5", amount: "0.5" },
      ctx,
    );
    assert.equal(result.ok, false);
    assert.match(result.content, /Gas tank exhausted/);
    assert.match(result.content, /GasTank UI/);
  });

  it("no sponsor capability → falls back to the wallet lane (sign)", async () => {
    let signed = 0;
    const { ctx } = loggingCtx({
      signAndSend: async () => {
        signed += 1;
        return "0xtx" as `0x${string}`;
      },
    });
    const result = await runEncodeTool(
      "withdraw",
      { tokenId: "5", amount: "0.5" },
      ctx,
    );
    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    assert.equal(result.ok, true);
    assert.equal(parsed.sponsored, undefined);
    assert.equal(parsed.txHash, "0xtx");
    assert.equal(signed, 1);
  });

  it("encode-only mode without sponsor → encode-only envelope (unchanged contract)", async () => {
    const { ctx } = loggingCtx({ mode: "encode-only" });
    const result = await runEncodeTool(
      "withdraw",
      { tokenId: "5", amount: "0.5" },
      ctx,
    );
    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    assert.equal(parsed.encodeOnly, true);
    assert.equal(parsed.sponsored, undefined);
  });

  it("sponsor rate-limit (transient) falls through to the wallet lane", async () => {
    let signed = 0;
    const { ctx } = loggingCtx({
      respond: async (path) => {
        if (path.startsWith("/v1/relayer/tank/")) {
          return {
            ok: true,
            status: 200,
            text: JSON.stringify({
              address: WALLET,
              balance: "0",
              grantsLeft: "2",
              nextNonce: "7",
            }),
          };
        }
        if (path === "/v1/relayer/sponsor") {
          return {
            ok: false,
            status: 429,
            text: JSON.stringify({
              error: "sponsor rate limit exceeded",
              code: "SPONSOR_RATE_LIMITED",
            }),
          };
        }
        if (path.startsWith("/v1/agents/")) {
          return {
            ok: true,
            status: 200,
            text: JSON.stringify({ to: VAULT, data: "0xdeadbeef", value: "0" }),
          };
        }
        return { ok: true, status: 200, text: "{}" };
      },
      sponsor: async () => ({
        signature: ("0x" + "77".repeat(65)) as `0x${string}`,
      }),
      signAndSend: async () => {
        signed += 1;
        return "0xtx2" as `0x${string}`;
      },
    });
    const result = await runEncodeTool(
      "withdraw",
      { tokenId: "5", amount: "0.5" },
      ctx,
    );
    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    assert.equal(parsed.sponsored, undefined);
    assert.equal(parsed.txHash, "0xtx2");
    assert.equal(signed, 1);
  });

  it("mint_agent is NOT sponsored — always the wallet lane", async () => {
    let sponsorHit = false;
    const { ctx } = loggingCtx({
      sponsor: async () => {
        sponsorHit = true;
        return { signature: ("0x" + "77".repeat(65)) as `0x${string}` };
      },
    });
    const result = await runEncodeTool(
      "mint_agent",
      { dataDescription: "agent" },
      ctx,
    );
    assert.equal(result.ok, true);
    assert.equal(sponsorHit, false);
  });
});

describe("gas_tank_status read tool", () => {
  it("reads balance/grants over direct chain access and reports opsLeft", async () => {
    const reads: string[] = [];
    const ctx = makeCtx({
      chainRead: async (req) => {
        reads.push(req.functionName);
        if (req.functionName === "balanceOf") return 20_000_000_000_000_000n;
        if (req.functionName === "grantsUsed") return 1n;
        if (req.functionName === "grantsCap") return 3n;
        if (req.functionName === "gasGrant") return 10_000_000_000_000_000n;
        throw new Error("unexpected read " + req.functionName);
      },
    });
    const result = await runReadTool("gas_tank_status", {}, ctx);
    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    assert.equal(result.ok, true);
    assert.equal(parsed.balance, "20000000000000000");
    assert.equal(parsed.grantsLeft, "2");
    assert.equal(parsed.opsLeft, 2);
    assert.equal(parsed.sponsored, true);
    assert.ok(
      reads.includes("gasGrant"),
      "reads the LIVE grant size (never hardcoded)",
    );
  });

  it("zero balance with grants left still reports sponsored (lazy grant)", async () => {
    const ctx = makeCtx({
      chainRead: async (req) => {
        if (req.functionName === "balanceOf") return 0n;
        if (req.functionName === "grantsUsed") return 1n;
        if (req.functionName === "grantsCap") return 3n;
        if (req.functionName === "gasGrant") return 10_000_000_000_000_000n;
        throw new Error("unexpected read");
      },
    });
    const result = await runReadTool("gas_tank_status", {}, ctx);
    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    assert.equal(parsed.balance, "0");
    assert.equal(parsed.sponsored, true);
  });

  it("zero balance + no grants → sponsored:false", async () => {
    const ctx = makeCtx({
      chainRead: async (req) => {
        if (req.functionName === "balanceOf") return 0n;
        if (req.functionName === "grantsUsed") return 3n;
        if (req.functionName === "grantsCap") return 3n;
        if (req.functionName === "gasGrant") return 10_000_000_000_000_000n;
        throw new Error("unexpected read");
      },
    });
    const result = await runReadTool("gas_tank_status", {}, ctx);
    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    assert.equal(parsed.sponsored, false);
  });

  it("no chain connection → falls back to the backend tank read route", async () => {
    const { ctx } = loggingCtx({});
    const result = await runReadTool("gas_tank_status", {}, ctx);
    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    assert.equal(result.ok, true);
    assert.equal(parsed.nextNonce, "7");
  });

  it("without a connected wallet → toolFail", async () => {
    const ctx = makeCtx({}) as ToolRuntime & {
      session: { walletAddress?: string };
    };
    ctx.session.walletAddress = undefined;
    const result = await runReadTool("gas_tank_status", {}, ctx);
    assert.equal(result.ok, false);
    assert.match(result.content, /Wallet not connected/);
  });
});

describe("faucet_status read tool (V3 W6-B)", () => {
  it("proxies GET /v1/relayer/faucet/:address and returns eligibility", async () => {
    const paths: string[] = [];
    const ctx = makeCtx({
      respond: async (path) => {
        paths.push(path);
        return {
          ok: true,
          status: 200,
          text: JSON.stringify({
            eligible: true,
            amount: "1000000000",
            token: "axmUSDC",
          }),
        };
      },
    });
    const result = await runReadTool("faucet_status", {}, ctx);
    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    assert.equal(result.ok, true);
    assert.equal(parsed.eligible, true);
    assert.equal(parsed.amount, "1000000000");
    assert.equal(parsed.token, "axmUSDC");
    assert.match(paths[0] ?? "", /\/v1\/relayer\/faucet\//);
  });

  it("without a connected wallet → toolFail", async () => {
    const ctx = makeCtx({}) as ToolRuntime & {
      session: { walletAddress?: string };
    };
    ctx.session.walletAddress = undefined;
    const result = await runReadTool("faucet_status", {}, ctx);
    assert.equal(result.ok, false);
    assert.match(result.content, /Wallet not connected/);
  });

  it("backend failure → toolFail with the surfaced error", async () => {
    const ctx = makeCtx({
      respond: async () => ({
        ok: false,
        status: 503,
        text: JSON.stringify({
          error: "relayer not enabled",
          code: "ADDRESS_NOT_CONFIGURED",
        }),
      }),
    });
    const result = await runReadTool("faucet_status", {}, ctx);
    assert.equal(result.ok, false);
    assert.match(result.content, /relayer not enabled/);
  });
});

describe("W9 DeFi encode tools (swap_tokens / add_liquidity / borrow)", () => {
  const USDC = "0x354ca53bab51c0666964fa050628d8351f8a7d19";
  const WETH = "0x62e5ead40c2105d44a705e87f370776bd12bf6ec";

  // resolveAxmTokenAddress reads the env pin for the weth side (live Galileo deploy).
  const savedSwapPair = process.env.AXIOM_SWAP_PAIR_TOKEN;
  process.env.AXIOM_SWAP_PAIR_TOKEN = WETH;

  /** loggingCtx with a paymentProcessor session address + ERC-20 allowance
   *  chain read, so the DeFi tools resolve their preconditions. */
  function defiCtx(
    opts: Parameters<typeof loggingCtx>[0] & {
      allowance?: bigint;
      paymentToken?: string;
    } = {},
  ) {
    const base = loggingCtx(opts);
    base.ctx.session.addresses = {
      ...base.ctx.session.addresses,
      paymentProcessor: PROCESSOR,
      paymentToken: (opts.paymentToken ?? USDC) as `0x${string}`,
    };
    base.ctx.chain = {
      chainId: 16602,
      readContract: async (req: {
        functionName: string;
        address: string;
      }) => {
        if (req.functionName === "allowance") return opts.allowance ?? BigInt(2n ** 96n);
        throw new Error("unexpected read " + req.functionName);
      },
    } as ToolRuntime["chain"];
    return base;
  }

  it("swap_tokens routes through the sponsor lane with swapExactIn calldata", async () => {
    const sponsorCalls: SponsorRequest[] = [];
    const { ctx, calls } = defiCtx({
      sponsor: async (req) => {
        sponsorCalls.push(req);
        return { signature: ("0x" + "77".repeat(65)) as `0x${string}` };
      },
    });
    const result = await runEncodeTool(
      "swap_tokens",
      { tokenIn: "usdc", amountIn: "1.5", minOut: "0.001" },
      ctx,
    );
    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    assert.equal(result.ok, true);
    assert.equal(parsed.sponsored, true);
    assert.equal(parsed.tokenIn, "usdc");
    assert.ok(calls.some((c) => c.path === "/v1/relayer/sponsor"));
    // ForwardRequest data must carry the swapExactIn selector targeting the Processor
    const submitted = calls.find((c) => c.path === "/v1/relayer/sponsor");
    const body = submitted!.body as unknown as { target: string; data: string };
    assert.equal(body.target, PROCESSOR);
    assert.ok(
      body.data.startsWith(
        encodeFunctionData({
          abi: PAY_ABI,
          functionName: "swapExactIn",
          args: [
            WALLET,
            0n,
            0n,
            { permitted: { token: WALLET, amount: 0n }, nonce: 0n, deadline: 0n },
            "0x",
          ],
        }).slice(0, 10),
      ),
      "ForwardRequest data carries swapExactIn calldata",
    );
  });

  it("swap_tokens with an unmet Permit2 allowance → requiresApproval envelope, no relay", async () => {
    const { ctx, calls } = defiCtx({ allowance: 1n });
    const result = await runEncodeTool(
      "swap_tokens",
      { tokenIn: "usdc", amountIn: "1.5" },
      ctx,
    );
    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    assert.equal(parsed.ok, false);
    assert.equal(parsed.requiresApproval, true);
    assert.ok(
      !calls.some((c) => c.path === "/v1/relayer/sponsor"),
      "never queues a doomed relay",
    );
  });

  it("swap_tokens 402 TANK_EXHAUSTED → terminal toolFail with remedy", async () => {
    const { ctx } = defiCtx({
      respond: async (path) => {
        if (path.startsWith("/v1/relayer/tank/")) {
          return {
            ok: true,
            status: 200,
            text: JSON.stringify({
              address: WALLET,
              balance: "0",
              grantsLeft: "0",
              nextNonce: "7",
            }),
          };
        }
        return { ok: true, status: 200, text: "{}" };
      },
      sponsor: async () => ({
        signature: ("0x" + "77".repeat(65)) as `0x${string}`,
      }),
    });
    const result = await runEncodeTool(
      "swap_tokens",
      { tokenIn: "usdc", amountIn: "1.5" },
      ctx,
    );
    assert.equal(result.ok, false);
    assert.match(result.content, /Gas tank exhausted/);
  });

  it("swap_tokens transient sponsor failure falls back to the wallet lane", async () => {
    let signed = 0;
    const { ctx } = defiCtx({
      respond: async (path) => {
        if (path === "/v1/relayer/sponsor") {
          return {
            ok: false,
            status: 429,
            text: JSON.stringify({
              error: "sponsor rate limit exceeded",
              code: "SPONSOR_RATE_LIMITED",
            }),
          };
        }
        return { ok: true, status: 200, text: "{}" };
      },
      sponsor: async () => ({
        signature: ("0x" + "77".repeat(65)) as `0x${string}`,
      }),
      signAndSend: async () => {
        signed += 1;
        return "0xtxswap" as `0x${string}`;
      },
    });
    const result = await runEncodeTool(
      "swap_tokens",
      { tokenIn: "usdc", amountIn: "1.5" },
      ctx,
    );
    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    assert.equal(parsed.sponsored, undefined);
    assert.equal(parsed.txHash, "0xtxswap");
    assert.equal(signed, 1);
  });

  it("borrow routes through the sponsor lane (no Permit2 prerequisite)", async () => {
    const { ctx, calls } = defiCtx({
      sponsor: async () => ({
        signature: ("0x" + "77".repeat(65)) as `0x${string}`,
      }),
      chainRead: undefined,
    });
    // strip the chain so a (wrongly) required allowance read would throw
    ctx.chain = undefined;
    const result = await runEncodeTool("borrow", { amount: "10" }, ctx);
    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    assert.equal(result.ok, true);
    assert.equal(parsed.sponsored, true);
    assert.ok(calls.some((c) => c.path === "/v1/relayer/sponsor"));
  });

  it("add_liquidity encodes the batch-permit calldata but never uses the sponsor lane", async () => {
    let sponsorHit = false;
    let signed = 0;
    const { ctx, calls } = defiCtx({
      sponsor: async () => {
        sponsorHit = true;
        return { signature: ("0x" + "77".repeat(65)) as `0x${string}` };
      },
      signAndSend: async () => {
        signed += 1;
        return "0xtxlp" as `0x${string}`;
      },
    });
    const result = await runEncodeTool(
      "add_liquidity",
      { usdcAmount: "100", wethAmount: "0.1" },
      ctx,
    );
    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    assert.equal(result.ok, true);
    assert.equal(parsed.sponsored, undefined, "wallet lane only");
    assert.equal(parsed.txHash, "0xtxlp");
    assert.equal(signed, 1);
    assert.equal(sponsorHit, false);
  });

  it("weth side requires AXIOM_SWAP_PAIR_TOKEN; missing address → toolFail", async () => {
    const saved = process.env.AXIOM_SWAP_PAIR_TOKEN;
    delete process.env.AXIOM_SWAP_PAIR_TOKEN;
    try {
      const { ctx } = defiCtx({});
      const result = await runEncodeTool(
        "swap_tokens",
        { tokenIn: "weth", amountIn: "0.1" },
        ctx,
      );
      assert.equal(result.ok, false);
      assert.match(result.content, /AXIOM_SWAP_PAIR_TOKEN/);
    } finally {
      if (saved !== undefined) process.env.AXIOM_SWAP_PAIR_TOKEN = saved;
    }
  });
});
