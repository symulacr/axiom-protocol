import { test, beforeAll, afterAll } from "bun:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { Wallet, getBytes, toBeHex } from "ethers";

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

let server: Server;
let baseUrl: string;
let signerAddress: string;

beforeAll(async () => {
  const signer = new TeeSigner(TEST_PRIV_HEX);
  signerAddress = signer.address;
  const storage = new InMemoryStorage();

  const { httpServer } = startServer({ signer, storage, bind: "127.0.0.1", port: 0 });
  server = httpServer;

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

afterAll(async () => {
  if (server) {
    const { promise, resolve } = Promise.withResolvers<void>();
    // bun emits an unhandled 'error' event on close() of a non-listening
    // server (Node invokes the callback with an error instead). Swallow it.
    const onErr = () => resolve();
    server.on("error", onErr);
    server.closeAllConnections?.();
    try {
      server.close((err) => {
        if (err) resolve();
        else resolve();
      });
    } catch {
      resolve();
    }
    await promise;
    server.off("error", onErr);
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
      to: "0x0000000000000000000000000000000000000001",
      nft: "0x0000000000000000000000000000000000000002",
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
    to: "0x0000000000000000000000000000000000000001" as `0x${string}`,
    nft: "0x0000000000000000000000000000000000000002" as `0x${string}`,
    nonce: toBeHex(7n) as `0x${string}`,
    validUntil: 99999999999n,
  };
  const digest = accessMessageHash(input);
  const sig = receiver.signingKey.sign(getBytes(digest)).serialized;
  const recovered = signer.recoverAccessSigner(sig, input);
  assert.equal(recovered.toLowerCase(), receiver.address.toLowerCase());
});
