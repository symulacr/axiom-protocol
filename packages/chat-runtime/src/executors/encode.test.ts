import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { keccak256, toHex } from "viem";
import { runEncodeTool } from "./encode.js";
import type { ToolRuntime } from "../transport.js";

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
      fetch: async (path: string, init?: { method?: string; body?: string }) => {
        calls.push({
          path,
          method: init?.method,
          body: init?.body ? JSON.parse(init.body) : undefined,
        });
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({ ok: true, to: "0xabc", data: "0xdef", value: "0" }),
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
    assert.equal(res.ok, true, "mint must still succeed when oracle is reachable");

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

  it("mint_agent still succeeds when oracle registration fails (non-fatal)", async () => {
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
      true,
      "a failed oracle registration must NOT break the on-chain mint",
    );
  });
});
