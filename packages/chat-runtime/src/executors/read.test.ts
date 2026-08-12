import { describe, it } from "bun:test";
import assert from "node:assert/strict";
import { runReadTool } from "./read.js";
import type { ToolRuntime } from "../transport.js";

function makeCtx(overrides: Record<string, unknown> = {}): ToolRuntime {
  return {
    http: {
      fetch: async () => ({
        ok: true,
        status: 200,
        text: async () => "",
        json: async () => ({ agents: [] }),
      }),
    },
    chain: { chainId: 1, readContract: async () => 0n, multicall: async () => [] },
    session: { chainId: 1 },
    mode: "sign",
    ...overrides,
  } as ToolRuntime;
}

const VAULT = ("0x" + "00".repeat(19) + "02") as `0x${string}`;
const AGENT_NFT = ("0x" + "00".repeat(19) + "01") as `0x${string}`;

function jsonHttp(body: unknown, ok = true): ToolRuntime["http"] {
  return {
    fetch: async () => ({
      ok,
      status: ok ? 200 : 502,
      text: async () => JSON.stringify(body),
      json: async () => body,
    }),
  };
}

describe("runReadTool", () => {
  it("vault_balance with no tokenId and no session token returns {ok:false}", async () => {
    const res = await runReadTool("vault_balance", {}, makeCtx());
    assert.equal(res.ok, false);
  });

  it("list_my_agents returns the agents for a connected wallet", async () => {
    const ctx = makeCtx({
      http: jsonHttp({ agents: [{ tokenId: 1 }, { tokenId: 2 }] }),
      session: {
        chainId: 1,
        walletAddress: ("0x" + "ab".repeat(20)) as `0x${string}`,
      },
    });
    const res = await runReadTool("list_my_agents", {}, ctx);
    assert.equal(res.ok, true);
    const data = JSON.parse(res.content) as { agents: unknown[] };
    assert.equal(data.agents.length, 2);
  });

  it("list_my_agents fails when no wallet is connected", async () => {
    const res = await runReadTool("list_my_agents", {}, makeCtx());
    assert.equal(res.ok, false);
    const data = JSON.parse(res.content) as { error: string };
    assert.equal(data.error, "Wallet not connected");
  });

  it("vault_balance returns the on-chain balance for the session token", async () => {
    const ctx = makeCtx({
      chain: {
        chainId: 1,
        readContract: async () => 5n,
        multicall: async () => [],
      },
      session: { chainId: 1, lastTokenId: "3", addresses: { vault: VAULT, agentNft: AGENT_NFT } },
    });
    const res = await runReadTool("vault_balance", {}, ctx);
    assert.equal(res.ok, true);
    const data = JSON.parse(res.content) as { tokenId: string; balance: string };
    assert.equal(data.tokenId, "3");
    assert.equal(data.balance, "5");
  });

  it("agent_metadata returns name, owner, and first data entry from multicall", async () => {
    const ctx = makeCtx({
      chain: {
        chainId: 1,
        readContract: async () => 0n,
        multicall: async () => [
          { result: "Axiom NFT" },
          { result: "0x" + "ab".repeat(20) },
          {
            result: [
              {
                dataDescription: "strategy v1",
                dataHash: "0x" + "aa".repeat(32),
              },
            ],
          },
        ],
      },
      session: { chainId: 1, lastTokenId: "7", addresses: { vault: VAULT, agentNft: AGENT_NFT } },
    });
    const res = await runReadTool("agent_metadata", {}, ctx);
    assert.equal(res.ok, true);
    const data = JSON.parse(res.content) as {
      tokenId: string;
      name: string;
      owner: string;
      dataDescription: string;
      dataHash: string;
    };
    assert.equal(data.tokenId, "7");
    assert.equal(data.name, "Axiom NFT");
    assert.equal(data.owner, "0x" + "ab".repeat(20));
    assert.equal(data.dataDescription, "strategy v1");
    assert.equal(data.dataHash, "0x" + "aa".repeat(32));
  });

  it("event_history fetches events with an optional eventName filter", async () => {
    let requestedPath = "";
    const ctx = makeCtx({
      http: {
        fetch: async (path: string) => {
          requestedPath = path;
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ events: [{ id: 1 }] }),
            json: async () => ({ events: [{ id: 1 }] }),
          };
        },
      },
      session: { chainId: 1 },
    });
    const res = await runReadTool(
      "event_history",
      { limit: 5, eventName: "Tick" },
      ctx,
    );
    assert.equal(res.ok, true);
    assert.ok(
      requestedPath.includes("/v1/events?limit=5"),
      `path was ${requestedPath}`,
    );
    assert.ok(
      requestedPath.includes("eventName=Tick"),
      `path was ${requestedPath}`,
    );
    const data = JSON.parse(res.content) as { events: unknown[] };
    assert.equal(data.events.length, 1);
  });

  it("unknown read tools fail with the shared envelope", async () => {
    const res = await runReadTool("nonsense", {}, makeCtx());
    assert.equal(res.ok, false);
    const data = JSON.parse(res.content) as { error: string };
    assert.ok(data.error.includes("Unknown read tool"));
  });
});
