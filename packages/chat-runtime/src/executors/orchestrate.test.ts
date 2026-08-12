import { describe, it } from "bun:test";
import assert from "node:assert/strict";
import type { ToolRuntime } from "../transport.js";
import { runOrchestrateTool, buildTickBody } from "./orchestrate.js";

const ctx = {
  http: {
    async fetch() {
      return { ok: true, status: 200, text: async () => "", json: async () => ({}) };
    },
  },
  session: {
    chainId: 1,
    addresses: { vault: "0xV" as `0x${string}`, agentNft: "0xN" as `0x${string}` },
  },
  mode: "encode-only",
} as unknown as ToolRuntime;

const VAULT = ("0x" + "00".repeat(19) + "02") as `0x${string}`;
const AGENT_NFT = ("0x" + "00".repeat(19) + "01") as `0x${string}`;
const STRATEGY_ROOT = "0x" + "aa".repeat(32);

function readyChain() {
  return {
    chainId: 1,
    readContract: async (req: { functionName: string }) => {
      if (req.functionName === "balanceOf") return 5n;
      if (req.functionName === "strategyOf") {
        return [STRATEGY_ROOT, 0n, 0n, 0n, 0n];
      }
      return undefined;
    },
    multicall: async () => [],
  };
}

describe("buildTickBody", () => {
  it("includes computeModel when provided", () => {
    const result = buildTickBody({ tokenId: "7", computeModel: "openai/gpt-4o" }, ctx);
    assert.equal(result.computeModel, "openai/gpt-4o");
    assert.equal(result.agentTokenId, "7");
    assert.equal(result.vault, "0xV");
    assert.equal(result.agentNft, "0xN");
  });

  it("omits computeModel when not provided", () => {
    const result = buildTickBody({ tokenId: "7" }, ctx);
    assert.equal("computeModel" in result, false);
    assert.equal(result.computeModel, undefined);
  });

  it("omits computeModel when only whitespace", () => {
    const result = buildTickBody({ tokenId: "7", computeModel: "   " }, ctx);
    assert.equal("computeModel" in result, false);
    assert.equal(result.computeModel, undefined);
  });
});

describe("runOrchestrateTool", () => {
  it("simulate_tick reports a ready simulated state from on-chain reads", async () => {
    const res = await runOrchestrateTool(
      "simulate_tick",
      { tokenId: "3" },
      {
        chain: readyChain(),
        session: {
          chainId: 1,
          lastTokenId: "3",
          addresses: { vault: VAULT, agentNft: AGENT_NFT },
        },
        mode: "encode-only",
      } as unknown as ToolRuntime,
    );
    assert.equal(res.ok, true);
    const data = JSON.parse(res.content) as {
      simulated: boolean;
      ready: boolean;
      balance: string;
      strategyRoot: string;
    };
    assert.equal(data.simulated, true);
    assert.equal(data.ready, true);
    assert.equal(data.balance, "5");
    assert.equal(data.strategyRoot, STRATEGY_ROOT);
  });

  it("execute_tick with dryRun and no chain connection short-circuits to simulated", async () => {
    const res = await runOrchestrateTool(
      "execute_tick",
      { tokenId: "3", dryRun: true },
      {
        session: { chainId: 1 },
        mode: "encode-only",
      } as unknown as ToolRuntime,
    );
    assert.equal(res.ok, true);
    const data = JSON.parse(res.content) as { simulated: boolean; tokenId: string };
    assert.equal(data.simulated, true);
    assert.equal(data.tokenId, "3");
  });

  it("execute_tick refuses when the vault balance is zero (NOT_READY)", async () => {
    const res = await runOrchestrateTool(
      "execute_tick",
      { tokenId: "3" },
      {
        chain: {
          chainId: 1,
          readContract: async (req: { functionName: string }) => {
            if (req.functionName === "balanceOf") return 0n;
            return [STRATEGY_ROOT, 0n, 0n, 0n, 0n];
          },
          multicall: async () => [],
        },
        session: {
          chainId: 1,
          lastTokenId: "3",
          addresses: { vault: VAULT, agentNft: AGENT_NFT },
        },
        mode: "encode-only",
      } as unknown as ToolRuntime,
    );
    assert.equal(res.ok, false);
    const data = JSON.parse(res.content) as { error: string };
    assert.ok(data.error.includes("NOT_READY"), `error was ${data.error}`);
  });

  it("execute_tick POSTs the tick body to the orchestrator when ready", async () => {
    const captured: { body?: Record<string, unknown> } = {};
    const res = await runOrchestrateTool(
      "execute_tick",
      { tokenId: "3", computeModel: "openai/gpt-4o" },
      {
        http: {
          fetch: async (_path: string, init?: { body?: string }) => {
            captured.body = JSON.parse(String(init?.body ?? "{}")) as Record<
              string,
              unknown
            >;
            return {
              ok: true,
              status: 200,
              text: async () => JSON.stringify({ ok: true, executed: true }),
              json: async () => ({ ok: true, executed: true }),
            };
          },
        },
        chain: readyChain(),
        session: {
          chainId: 1,
          lastTokenId: "3",
          addresses: { vault: VAULT, agentNft: AGENT_NFT },
        },
        mode: "encode-only",
      } as unknown as ToolRuntime,
    );
    assert.equal(res.ok, true);
    const data = JSON.parse(res.content) as { ok: boolean; executed: boolean };
    assert.equal(data.executed, true);
    assert.equal(captured.body?.vault, VAULT);
    assert.equal(captured.body?.agentNft, AGENT_NFT);
    assert.equal(captured.body?.agentTokenId, "3");
    assert.equal(captured.body?.computeModel, "openai/gpt-4o");
  });

  it("execute_tick fails with the shared envelope when the HTTP call fails", async () => {
    const res = await runOrchestrateTool(
      "execute_tick",
      { tokenId: "3" },
      {
        http: {
          fetch: async () => ({
            ok: false,
            status: 502,
            text: async () => "",
            json: async () => ({}),
          }),
        },
        chain: readyChain(),
        session: {
          chainId: 1,
          lastTokenId: "3",
          addresses: { vault: VAULT, agentNft: AGENT_NFT },
        },
        mode: "encode-only",
      } as unknown as ToolRuntime,
    );
    assert.equal(res.ok, false);
    const data = JSON.parse(res.content) as { error: string };
    assert.equal(data.error, "tick http fail");
  });

  it("unknown orchestrate tools fail with the shared envelope", async () => {
    const res = await runOrchestrateTool("nonsense", {}, ctx);
    assert.equal(res.ok, false);
    const data = JSON.parse(res.content) as { error: string };
    assert.ok(data.error.includes("Unknown orchestrate tool"));
  });
});
