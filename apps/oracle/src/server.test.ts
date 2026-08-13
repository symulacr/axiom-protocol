import { test, beforeAll, afterAll } from "bun:test";
import assert from "node:assert/strict";
import type http from "node:http";
import { keccak256 } from "ethers";

import { startServer } from "./server.js";
import { TeeSigner } from "./signer.js";
import { InMemoryStorage, type StorageAdapter } from "@axiom/config/storage/0g";
import {
  sealKeyForReceiver,
  deriveUncompressedPubkeyFromHex,
} from "@axiom/config/crypto/keys";

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

  const { httpServer } = startServer({
    signer,
    storage,
    bind: "127.0.0.1",
    port: 0,
  });
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

test("/v1/ownership honors caller-supplied validUntil within the max proof age cap", async () => {
  const validUntil = Math.floor(Date.now() / 1000) + 3600;
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

test("/v1/ownership rejects validUntil beyond the max proof age cap", async () => {
  // 10 days ahead > on-chain maxProofAgeSeconds (deployed 7 days): the verifier would
  // reject the proof with AxiomValidUntilTooFar, so the oracle must refuse to sign it.
  const validUntil = Math.floor(Date.now() / 1000) + 10 * 86400;
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
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(isRecord(body));
  assert.match(body.error as string, /max proof validity|maxProofAgeSeconds/);
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

test("/v1/agents/mint marks a fresh dataHash as seen (happy + idempotent duplicate)", async () => {
  const fresh = "0x" + "dd".repeat(32);
  const res = await fetch(`${baseUrl}/v1/agents/mint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataHash: fresh }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.ok, true);
  assert.equal(body.seen, true);
  assert.equal(body.dataHash, fresh);

  // Duplicate mint is idempotent — no error, still 200.
  const dup = await fetch(`${baseUrl}/v1/agents/mint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataHash: fresh }),
  });
  assert.equal(dup.status, 200);
  const dupBody = (await dup.json()) as Record<string, unknown>;
  assert.equal(dupBody.ok, true);

  // The minted hash is now accepted by the ownership route.
  const ownership = await fetch(`${baseUrl}/v1/ownership`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dataHash: fresh,
      targetPubkey,
      sealedKey,
      to: "0x0000000000000000000000000000000000000001",
      nft: "0x0000000000000000000000000000000000000002",
      nonce: 1,
    }),
  });
  assert.equal(ownership.status, 200);
});

test("/v1/agents/mint rejects a malformed dataHash", async () => {
  const res = await fetch(`${baseUrl}/v1/agents/mint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataHash: "0x1234" }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as Record<string, unknown>;
  assert.ok(typeof body.error === "string", "400 carries an error message");
});

test("/v1/transfer-validity aborts with 502 and uploads nothing when the old blob download fails", async () => {
  const signer = new TeeSigner(TEST_PRIV_HEX);
  const RECEIVER_PRIV_HEX = "0x" + "22".repeat(32);
  const receiverPubkey64 = deriveUncompressedPubkeyFromHex(RECEIVER_PRIV_HEX);
  const receiverPubkeyHex =
    "0x" + Buffer.from(receiverPubkey64).toString("hex");
  const uploaded: Uint8Array[] = [];
  const storage: StorageAdapter = {
    upload: async (blob: Uint8Array) => {
      uploaded.push(blob);
      return { rootHash: keccak256(blob) as `0x${string}` };
    },
    download: async () => {
      throw new Error("blob missing from storage");
    },
    markDataHashSeen: () => {},
    hasSeenDataHash: () => false,
  };

  const { httpServer: srv } = startServer({
    signer,
    storage,
    bind: "127.0.0.1",
    port: 0,
  });
  await new Promise<void>((resolve, reject) => {
    srv.once("listening", resolve);
    srv.once("error", reject);
  });
  const addr = srv.address();
  if (addr === null || typeof addr === "string") {
    throw new Error("server did not bind");
  }
  const url = `http://127.0.0.1:${addr.port}`;

  try {
    const oldDataHash = "0x" + "dd".repeat(32);
    const oldDataKey = crypto.getRandomValues(new Uint8Array(32));
    const sealedDek = sealKeyForReceiver(signer.uncompressedPubkey, oldDataKey);
    const sealedDataEncryptionKey =
      "0x" + Buffer.from(sealedDek).toString("hex");

    const res = await fetch(`${url}/v1/transfer-validity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        oldDataHash,
        oldDataUri: oldDataHash,
        targetPubkey64: receiverPubkeyHex,
        accessProofNonce: 1,
        to: "0x0000000000000000000000000000000000000001",
        nft: "0x0000000000000000000000000000000000000002",
        sealedDataEncryptionKey,
      }),
    });
    // E2: a failed download MUST abort the transfer — re-keying an empty blob would
    // silently destroy the token's stored data and sign proofs over fabricated content.
    assert.equal(res.status, 502);
    const body = (await res.json()) as Record<string, unknown>;
    assert.match(body.error as string, /blob missing from storage/);
    assert.equal(
      uploaded.length,
      0,
      "no re-encrypted blob may be uploaded when the old blob cannot be downloaded",
    );
  } finally {
    srv.closeAllConnections?.();
    await new Promise<void>((resolve) => {
      const onErr = () => resolve();
      srv.on("error", onErr);
      try {
        srv.close(() => resolve());
      } catch {
        resolve();
      }
      srv.off("error", onErr);
    });
  }
});
