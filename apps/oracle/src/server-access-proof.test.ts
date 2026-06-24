import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { Wallet, getBytes } from "ethers";

import { startServer } from "./server.js";
import { TeeSigner, accessMessageHash } from "./signer.js";
import { InMemoryStorage } from "@axiom/config/storage/0g";

const TEST_PRIV_HEX = "0x" + "11".repeat(32);
const RECEIVER_PRIV_HEX = "0x" + "22".repeat(32);
const dataHash = "0x" + "aa".repeat(32);
const targetPubkey = "0x" + "bb".repeat(64);
const sealedKey = "0x" + "cc".repeat(32);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const originalListen = express.application.listen;
let server: Server;
let baseUrl: string;
let signerAddress: string;

before(async () => {
  const signer = new TeeSigner(TEST_PRIV_HEX);
  signerAddress = signer.address;
  const storage = new InMemoryStorage();

  express.application.listen = function (this: Express, ...args: Parameters<typeof originalListen>) {
    server = originalListen.apply(this, args);
    return server;
  };
  startServer({ signer, storage, bind: "127.0.0.1", port: 0 });
  express.application.listen = originalListen;

  const { promise, resolve, reject } = Promise.withResolvers<void>();
  server.once("listening", resolve);
  server.once("error", reject);
  await promise;

  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;

  const mint = await fetch(`${baseUrl}/v1/agents/mint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataHash }),
  });
  assert.equal(mint.status, 200);
});

after(async () => {
  if (server) {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    server.closeAllConnections?.();
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
    await promise;
  }
});

test("POST /v1/ownership no longer returns an accessSignature", async () => {
  const res = await fetch(`${baseUrl}/v1/ownership`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dataHash,
      targetPubkey,
      sealedKey,
      nonce: 1,
    }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(isRecord(body));
  assert.equal(body.accessSignature, undefined, "oracle must not sign AccessProof");
  assert.equal(typeof body.signature, "string");
  assert.equal(body.signer, signerAddress);
});

test("recoverAccessSigner still recovers a raw-ECDSA AccessProof", async () => {
  const signer = new TeeSigner(TEST_PRIV_HEX);
  const receiver = new Wallet(RECEIVER_PRIV_HEX);
  const input = {
    dataHash: dataHash as `0x${string}`,
    targetPubkey: targetPubkey as `0x${string}`,
    nonce: 7n,
    validUntil: 99999999999n,
  };
  const digest = accessMessageHash(input);
  const sig = receiver.signingKey.sign(getBytes(digest)).serialized;
  const recovered = signer.recoverAccessSigner(sig, input);
  assert.equal(recovered.toLowerCase(), receiver.address.toLowerCase());
});
