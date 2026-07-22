import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ToolRuntime } from "../transport.js";
import { runAskTool } from "./ask.js";

const ctx = {
  http: {
    async fetch() {
      return { ok: true, status: 200, text: async () => "", json: async () => ({}) };
    },
  },
  session: { chainId: 1 },
  mode: "encode-only",
} as unknown as ToolRuntime;

describe("runAskTool", () => {
  it("returns ok:false (does not throw) when question is missing", async () => {
    const result = await runAskTool("ask_user", {}, ctx);
    assert.equal(result.ok, false);
    assert.ok(typeof (result as { error?: string }).error === "string");
  });

  it("returns ok:true when a question is provided", async () => {
    const result = await runAskTool("ask_user", { question: "Proceed?" }, ctx);
    assert.equal(result.ok, true);
  });
});
