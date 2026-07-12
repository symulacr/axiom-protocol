import { test } from "node:test";
import assert from "node:assert/strict";
import { runArchiveTool } from "./archive.js";
import type { ToolRuntime } from "./transport.js";

function ctxWithCapture(capture: { body?: string }): ToolRuntime {
  return {
    http: {
      async fetch(_path: string, init?: { body?: string | Uint8Array | Record<string, unknown> | null }) {
        capture.body = typeof init?.body === "string" ? init.body : undefined;
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({ count: 0, snapshots: [], cached: false });
          },
        };
      },
    },
    session: { chainId: 1 },
  } as unknown as ToolRuntime;
}

test("archive limit is clamped to a sane maximum (F-17)", async () => {
  const cap: { body?: string } = {};
  await runArchiveTool("archive_lookup", { url: "http://example.com", limit: 1_000_000 }, ctxWithCapture(cap));
  const body = JSON.parse(cap.body ?? "{}") as Record<string, unknown>;
  assert.equal(body.limit, 200);
});

test("archive limit defaults when omitted (F-17)", async () => {
  const cap: { body?: string } = {};
  await runArchiveTool("archive_lookup", { url: "http://example.com" }, ctxWithCapture(cap));
  const body = JSON.parse(cap.body ?? "{}") as Record<string, unknown>;
  assert.equal(body.limit, 50);
});

test("archive limit passes through normal values (F-17)", async () => {
  const cap: { body?: string } = {};
  await runArchiveTool("archive_account_tweets", { handle: "foo", limit: 12 }, ctxWithCapture(cap));
  const body = JSON.parse(cap.body ?? "{}") as Record<string, unknown>;
  assert.equal(body.limit, 12);
});

test("archive requires url before calling the backend (F-17)", async () => {
  const cap: { body?: string } = {};
  const res = await runArchiveTool("archive_lookup", {}, ctxWithCapture(cap));
  assert.equal(JSON.parse(res.content).error, "url required");
  assert.equal(cap.body, undefined);
});
