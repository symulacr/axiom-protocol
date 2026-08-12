import { describe, it } from "bun:test";
import assert from "node:assert/strict";
import type { ToolRuntime } from "../transport.js";
import { buildTickBody } from "./orchestrate.js";

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
