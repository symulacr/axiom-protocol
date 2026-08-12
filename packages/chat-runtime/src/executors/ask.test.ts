import { describe, it } from "bun:test";
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
    // toolFail surfaces the error in content (rendered by format.ts as "Error: …")
    const body = JSON.parse(result.content) as { error?: string };
    assert.ok(typeof body.error === "string" && body.error.length > 0);
  });

  it("returns ok:true when a question is provided", async () => {
    const result = await runAskTool("ask_user", { question: "Proceed?" }, ctx);
    assert.equal(result.ok, true);
  });
});
