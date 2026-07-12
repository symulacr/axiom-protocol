import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runArchiveTool } from "./archive.js";
import type { ToolRuntime } from "../transport.js";

function makeCtx(capture?: { body?: Record<string, unknown> }): ToolRuntime {
  return {
    http: {
      fetch: async (_path: string, init?: { body?: string }) => {
        if (capture) capture.body = JSON.parse(String(init?.body));
        return { ok: true, status: 200, text: async () => "", json: async () => ({}) };
      },
    },
    session: { chainId: 1 },
    mode: "sign",
  } as ToolRuntime;
}

describe("runArchiveTool", () => {
  it("archive_lookup with no url returns {ok:false}", async () => {
    const res = await runArchiveTool("archive_lookup", {}, makeCtx());
    assert.equal(res.ok, false);
  });

  it("defaults lookup limit to 50", async () => {
    const capture: { body?: Record<string, unknown> } = {};
    await runArchiveTool("archive_lookup", { url: "https://x.com/a" }, makeCtx(capture));
    assert.equal(capture.body?.limit, 50);
  });

  it("defaults account_tweets limit to 100", async () => {
    const capture: { body?: Record<string, unknown> } = {};
    await runArchiveTool(
      "archive_account_tweets",
      { handle: "0xSero" },
      makeCtx(capture),
    );
    assert.equal(capture.body?.limit, 100);
  });
});
