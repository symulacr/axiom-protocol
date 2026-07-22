import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runReadTool } from "./read.js";
import type { ToolRuntime } from "../transport.js";

function makeCtx(overrides: Partial<ToolRuntime> = {}): ToolRuntime {
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

describe("runReadTool", () => {
  it("vault_balance with no tokenId and no session token returns {ok:false}", async () => {
    const res = await runReadTool("vault_balance", {}, makeCtx());
    assert.equal(res.ok, false);
  });
});
