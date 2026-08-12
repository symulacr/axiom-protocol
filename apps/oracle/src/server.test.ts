import { test, beforeAll, afterAll } from "bun:test";
import assert from "node:assert/strict";
import type http from "node:http";

import { startServer } from "./server.js";
import { TeeSigner } from "./signer.js";
import { InMemoryStorage } from "@axiom/config/storage/0g";

const TEST_PRIV_HEX = "0x" + "11".repeat(32);
const dataHash = "0x" + "aa".repeat(32);
const targetPubkey = "0x" + "bb".repeat(64);
const sealedKey = "0x" + "cc".repeat(32);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

let server: http.Server;
let baseUrl: string;
let signerAddress: string;

beforeAll(async () => {
  const signer = new TeeSigner(TEST_PRIV_HEX);
  signerAddress = signer.address;
  const storage = new InMemoryStorage();

  const { httpServer } = startServer({ signer, storage, bind: "127.0.0.1", port: 0 });
  server = httpServer;

  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("server did not bind to a port");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;

  const mint = await fetch(`${baseUrl}/v1/agents/mint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataHash }),
  });
  assert.equal(mint.status, 200);
});

afterAll(async () => {
  if (server) {
    // bun emits an unhandled 'error' event on close() of a non-listening
    // server (Node invokes the callback with an error instead). Swallow it.
    await new Promise<void>((resolve) => {
      const onErr = () => resolve();
      server.on("error", onErr);
      server.closeAllConnections?.();
      try {
        server.close(() => resolve());
      } catch {
        resolve();
      }
      server.off("error", onErr);
    });
  }
});

test("/v1/ownership honors caller-supplied validUntil", async () => {
  const validUntil = 1893456000;
  const res = await fetch(`${baseUrl}/v1/ownership`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dataHash,
      targetPubkey,
      sealedKey,
      to: "0x0000000000000000000000000000000000000001",
      nft: "0x0000000000000000000000000000000000000002",
      nonce: 42,
      validUntil,
    }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(isRecord(body));
  assert.equal(body.validUntil, String(validUntil));
  assert.equal(typeof body.signature, "string");
  assert.equal(body.signer, signerAddress);
});

test("/v1/ownership rejects malformed validUntil", async () => {
  const res = await fetch(`${baseUrl}/v1/ownership`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dataHash,
      targetPubkey,
      sealedKey,
      to: "0x0000000000000000000000000000000000000001",
      nft: "0x0000000000000000000000000000000000000002",
      nonce: 42,
      validUntil: "not-a-number",
    }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(isRecord(body));
  assert.equal(body.error, "Invalid validUntil");
});
