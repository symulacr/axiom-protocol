import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
});
