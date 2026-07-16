import assert from "node:assert/strict";
import test from "node:test";
import { postEvent } from "./sink.js";
import type { AxiomEvent } from "./events.js";

const sampleEvent = {
  kind: "Transfer",
  blockNumber: 1,
  txHash: "0xabc",
  logIndex: 0,
  from: "0x1",
  to: "0x2",
  tokenId: 1n,
} as unknown as AxiomEvent;

test("postEvent throws on 4xx so watcher must not advance checkpoint", async () => {
  await assert.rejects(
    () =>
      postEvent(sampleEvent, {
        backendUrl: "http://127.0.0.1:9",
        maxRetries: 0,
        fetcher: async () =>
          new Response(JSON.stringify({ error: "bad" }), { status: 401 }),
      }),
    /rejected with 401|not advancing checkpoint/i,
  );
});

test("postEvent returns status on 2xx", async () => {
  const r = await postEvent(sampleEvent, {
    backendUrl: "http://127.0.0.1:9",
    maxRetries: 0,
    fetcher: async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
  });
  assert.equal(r.status, 200);
});
