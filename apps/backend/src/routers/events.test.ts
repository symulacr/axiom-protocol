import { test } from "bun:test";
import assert from "node:assert/strict";
import express from "express";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import type { Log } from "ethers";
import { registerEventRoutes, INDEXER_KEY_HEADER } from "./events.js";
import type { EventStore } from "../events/store.js";
import type { ServerConfig } from "../server.js";
import { decodeAxiomLog } from "../indexer/events/parser.js";
import { EVENT_ABI } from "../indexer/events.js";

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

/** Boots a fresh app, POSTs one event, closes the server; the JSON body is
 *  parsed before close so nothing depends on a drained socket. */
async function postEvent(
  body: unknown,
  indexerKey: string,
): Promise<{ status: number; body: unknown }> {
  const app = buildEventsApp();
  const server = app.listen(0);
  try {
    const addr = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${addr.port}/v1/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [INDEXER_KEY_HEADER]: indexerKey,
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("POST /v1/events rejects an untrusted source (event-store poisoning guard)", async () => {
  const { status, body } = await postEvent(
    { ...validBody, source: "attacker" },
    INDEXER_KEY,
  );
  assert.ok(
    status === 400 || status === 401 || status === 403,
    `untrusted source must be rejected, got ${status}`,
  );
  assert.equal((body as { code?: string }).code, "UNTRUSTED_EVENT_SOURCE");
});

test("POST /v1/events rejects a missing/incorrect dedicated indexer key", async () => {
  const { status, body } = await postEvent(validBody, "not-the-right-key");
  assert.equal(
    status,
    401,
    "request without the dedicated indexer key must be rejected",
  );
  assert.equal((body as { code?: string }).code, "INDEXER_UNAUTHORIZED");
});

test("POST /v1/events accepts a trusted source with the dedicated indexer key", async () => {
  const { status, body } = await postEvent(validBody, INDEXER_KEY);
  assert.ok(
    status >= 200 && status < 300,
    `trusted source with the dedicated key must be accepted, got ${status}`,
  );
  assert.ok(
    (body as { stored?: unknown }).stored,
    "response should include the stored event",
  );
});

test("POST /v1/events accepts an event without a txHash (no over-gating)", async () => {
  const { txHash: _omit, ...noTxHash } = validBody;
  void _omit;
  const { status, body } = await postEvent(noTxHash, INDEXER_KEY);
  assert.ok(
    status >= 200 && status < 300,
    `event without txHash must be accepted, got ${status}`,
  );
  const stored = (body as { stored?: { txHash?: unknown } }).stored;
  assert.ok(stored, "response should include the stored event");
  assert.ok(
    stored.txHash === null || stored.txHash === undefined,
    `stored event txHash should be null/undefined, got ${JSON.stringify(
      stored.txHash,
    )}`,
  );
});

const DECODE_TX = "0x" + "ab".repeat(32);

function decodeLog(
  topics: readonly (string | string[] | null)[],
  data: string,
  blockNumber = 100,
): Log {
  return {
    topics,
    data,
    blockNumber,
    transactionHash: DECODE_TX,
    index: 2,
  } as unknown as Log;
}

test("decodeAxiomLog decodes StorageInfoUpdated(oldInfo, newInfo) into the AxiomEvent shape", () => {
  const abi = EVENT_ABI.StorageInfoUpdated;
  const topics = encodeEventTopics({
    abi: [abi],
    eventName: "StorageInfoUpdated",
    args: {},
  });
  const data = encodeAbiParameters(
    [{ type: "string" }, { type: "string" }],
    ["ipfs://old-description", "ipfs://new-description"],
  );
  const decoded = decodeAxiomLog(decodeLog(topics, data));
  assert.deepEqual(decoded, {
    kind: "StorageInfoUpdated",
    blockNumber: 100,
    txHash: DECODE_TX,
    logIndex: 2,
    oldInfo: "ipfs://old-description",
    newInfo: "ipfs://new-description",
  });
});

test("decodeAxiomLog decodes Updated(tokenId, oldDatas, newDatas) into count fields", () => {
  const abi = EVENT_ABI.Updated;
  const topics = encodeEventTopics({
    abi: [abi],
    eventName: "Updated",
    args: { tokenId: 7n },
  });
  const data = encodeAbiParameters(
    [
      {
        type: "tuple[]",
        components: [
          { name: "dataDescription", type: "string" },
          { name: "dataHash", type: "bytes32" },
        ],
      },
      {
        type: "tuple[]",
        components: [
          { name: "dataDescription", type: "string" },
          { name: "dataHash", type: "bytes32" },
        ],
      },
    ],
    [
      [
        {
          dataDescription: "old",
          dataHash: ("0x" + "aa".repeat(32)) as `0x${string}`,
        },
      ],
      [
        {
          dataDescription: "new-1",
          dataHash: ("0x" + "bb".repeat(32)) as `0x${string}`,
        },
        {
          dataDescription: "new-2",
          dataHash: ("0x" + "cc".repeat(32)) as `0x${string}`,
        },
      ],
    ],
  );
  const decoded = decodeAxiomLog(decodeLog(topics, data));
  assert.equal(decoded?.kind, "Updated");
  if (decoded?.kind === "Updated") {
    assert.equal(decoded.tokenId, 7n);
    assert.equal(decoded.oldDatasCount, 1);
    assert.equal(decoded.newDatasCount, 2);
  }
});

test("decodeAxiomLog drops a log whose topic0 matches no watched event", () => {
  const decoded = decodeAxiomLog(
    decodeLog(["0x" + "ff".repeat(32)], "0x", 101),
  );
  assert.equal(decoded, null);
});
