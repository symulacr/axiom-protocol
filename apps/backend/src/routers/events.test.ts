import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { registerEventRoutes, INDEXER_KEY_HEADER } from "./events.js";
import type { EventStore } from "../events/store.js";
import type { ServerConfig } from "../server.js";

const INDEXER_KEY = "super-secret-indexer-key";

function makeEventStore(): EventStore {
  const stored: unknown[] = [];
  return {
    append: (e: Record<string, unknown>) => {
      const out = { ...e, receivedAt: Date.now(), timestamp: Date.now() };
      stored.push(out);
      return out;
    },
    getAll: () => stored,
  } as unknown as EventStore;
}

function buildEventsApp() {
  const config = {
    bind: "0.0.0.0",
    port: 0,
    evmRpc: "https://evmrpc.0g.ai",
    signer: {} as ServerConfig["signer"],
    oracleBaseUrl: "http://oracle",
    env: {
      AXIOM_INDEXER_API_KEY: INDEXER_KEY,
    } as unknown as ServerConfig["env"],
  } as unknown as ServerConfig;

  const app = express();
  app.use(express.json());
  registerEventRoutes(app, config, makeEventStore());
  return app;
}

const validBody = {
  source: "indexer",
  eventName: "Tick",
  chainId: 16661,
  blockNumber: 123,
  txHash: "0x" + "ab".repeat(32),
  logIndex: 0,
  payload: { tokenId: "999", value: "1" },
};

test("POST /v1/events rejects an untrusted source (event-store poisoning guard)", async () => {
  const app = buildEventsApp();
  const server = app.listen(0);
  try {
    const addr = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${addr.port}/v1/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [INDEXER_KEY_HEADER]: INDEXER_KEY,
      },
      body: JSON.stringify({ ...validBody, source: "attacker" }),
    });
    assert.ok(
      res.status === 400 || res.status === 401 || res.status === 403,
      `untrusted source must be rejected, got ${res.status}`,
    );
    const body = (await res.json()) as { code?: string };
    assert.equal(body.code, "UNTRUSTED_EVENT_SOURCE");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("POST /v1/events rejects a missing/incorrect dedicated indexer key", async () => {
  const app = buildEventsApp();
  const server = app.listen(0);
  try {
    const addr = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${addr.port}/v1/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [INDEXER_KEY_HEADER]: "not-the-right-key",
      },
      body: JSON.stringify(validBody),
    });
    assert.equal(
      res.status,
      401,
      "request without the dedicated indexer key must be rejected",
    );
    const body = (await res.json()) as { code?: string };
    assert.equal(body.code, "INDEXER_UNAUTHORIZED");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("POST /v1/events accepts a trusted source with the dedicated indexer key", async () => {
  const app = buildEventsApp();
  const server = app.listen(0);
  try {
    const addr = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${addr.port}/v1/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [INDEXER_KEY_HEADER]: INDEXER_KEY,
      },
      body: JSON.stringify(validBody),
    });
    assert.ok(
      res.status >= 200 && res.status < 300,
      `trusted source with the dedicated key must be accepted, got ${res.status}`,
    );
    const body = (await res.json()) as { stored?: unknown };
    assert.ok(body.stored, "response should include the stored event");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("POST /v1/events accepts an event without a txHash (no over-gating)", async () => {
  const app = buildEventsApp();
  const server = app.listen(0);
  try {
    const addr = server.address() as { port: number };
    const { txHash: _omit, ...noTxHash } = validBody;
    void _omit;
    const res = await fetch(`http://127.0.0.1:${addr.port}/v1/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [INDEXER_KEY_HEADER]: INDEXER_KEY,
      },
      body: JSON.stringify(noTxHash),
    });
    assert.ok(
      res.status >= 200 && res.status < 300,
      `event without txHash must be accepted, got ${res.status}`,
    );
    const body = (await res.json()) as { stored?: { txHash?: unknown } };
    assert.ok(body.stored, "response should include the stored event");
    assert.ok(
      body.stored.txHash === null || body.stored.txHash === undefined,
      `stored event txHash should be null/undefined, got ${JSON.stringify(
        body.stored.txHash,
      )}`,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
