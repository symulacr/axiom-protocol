import { test, beforeAll, afterAll } from "bun:test";
import assert from "node:assert/strict";
import type http from "node:http";
import { keccak256 } from "ethers";
import express from "express";

import {
  registerOracleRoutes,
  transferValidity,
  signOwnership,
  OracleRequestError,
  type OracleRouteDeps,
  type TransferValidityInput,
} from "../oracle/routes.js";
import { TeeSigner } from "../oracle/signer.js";
import { InMemoryStorage, type StorageAdapter } from "@axiom/config/storage/0g";
import {
  sealKeyForReceiver,
  deriveUncompressedPubkeyFromHex,
} from "@axiom/config/crypto/keys";
import { ARISTOTLE_CHAIN_ID } from "@axiom/config";

const TEST_PRIV_HEX = "0x" + "11".repeat(32);
const dataHash = ("0x" + "aa".repeat(32)) as `0x${string}`;
const targetPubkey = ("0x" + "bb".repeat(64)) as `0x${string}`;
const sealedKey = ("0x" + "cc".repeat(32)) as `0x${string}`;
const MOCK_VERIFIER = ("0x" + "00".repeat(19) + "03") as `0x${string}`;

let server: http.Server;
let baseUrl: string;
let signerAddress: string;
let deps: OracleRouteDeps;

function makeDeps(signer: TeeSigner, storage: StorageAdapter): OracleRouteDeps {
  return {
    signer,
    storage,
    chainId: BigInt(ARISTOTLE_CHAIN_ID),
    verifier: MOCK_VERIFIER,
  };
}

beforeAll(async () => {
  const signer = new TeeSigner(TEST_PRIV_HEX);
  signerAddress = signer.address;
  const storage = new InMemoryStorage();
  deps = makeDeps(signer, storage);

  // In-process mount: registerOracleRoutes carries NO middleware, so the bare
  // app adds express.json itself (same as the backend host app does).
  const app = express();
  app.use(express.json());
  registerOracleRoutes(app, deps);
  server = app.listen(0, "127.0.0.1");

  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("server did not bind to a port");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;

  const mint = await fetch(`${baseUrl}/oracle/v1/agents/mint`, {
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

test("signOwnership honors caller-supplied validUntil within the max proof age cap", async () => {
  const validUntil = Math.floor(Date.now() / 1000) + 3600;
  const result = await signOwnership(deps, {
    dataHash,
    targetPubkey,
    sealedKey,
    to: "0x0000000000000000000000000000000000000001",
    nft: "0x0000000000000000000000000000000000000002",
    nonce: 42,
    validUntil,
  });
  assert.equal(result.validUntil, String(validUntil));
  assert.equal(typeof result.signature, "string");
  assert.equal(result.signer, signerAddress);
});

test("signOwnership rejects validUntil beyond the max proof age cap", async () => {
  // 10 days ahead > on-chain maxProofAgeSeconds (deployed 7 days): the verifier would
  // reject the proof with AxiomValidUntilTooFar, so the oracle must refuse to sign it.
  const validUntil = Math.floor(Date.now() / 1000) + 10 * 86400;
  await assert.rejects(
    signOwnership(deps, {
      dataHash,
      targetPubkey,
      sealedKey,
      to: "0x0000000000000000000000000000000000000001",
      nft: "0x0000000000000000000000000000000000000002",
      nonce: 42,
      validUntil,
    }),
    (err: unknown) => {
      assert.ok(err instanceof OracleRequestError);
      assert.equal(err.status, 400);
      assert.match(err.message, /max proof validity|maxProofAgeSeconds/);
      return true;
    },
  );
});

test("signOwnership rejects malformed validUntil", async () => {
  await assert.rejects(
    signOwnership(deps, {
      dataHash,
      targetPubkey,
      sealedKey,
      to: "0x0000000000000000000000000000000000000001",
      nft: "0x0000000000000000000000000000000000000002",
      nonce: 42,
      validUntil: "not-a-number",
    }),
    (err: unknown) => {
      assert.ok(err instanceof OracleRequestError);
      assert.equal(err.status, 400);
      assert.equal(err.message, "Invalid validUntil");
      return true;
    },
  );
});

test("/oracle/v1/agents/mint marks a fresh dataHash as seen (happy + idempotent duplicate)", async () => {
  const fresh = "0x" + "dd".repeat(32);
  const res = await fetch(`${baseUrl}/oracle/v1/agents/mint`, {
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
  const dup = await fetch(`${baseUrl}/oracle/v1/agents/mint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataHash: fresh }),
  });
  assert.equal(dup.status, 200);
  const dupBody = (await dup.json()) as Record<string, unknown>;
  assert.equal(dupBody.ok, true);

  // The minted hash is now accepted by the ownership route.
  const ownership = await signOwnership(deps, {
    dataHash: fresh as `0x${string}`,
    targetPubkey,
    sealedKey,
    to: "0x0000000000000000000000000000000000000001",
    nft: "0x0000000000000000000000000000000000000002",
    nonce: 1,
  });
  assert.equal(typeof ownership.signature, "string");
});

test("/oracle/v1/agents/mint rejects a malformed dataHash", async () => {
  const res = await fetch(`${baseUrl}/oracle/v1/agents/mint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataHash: "0x1234" }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as Record<string, unknown>;
  assert.ok(typeof body.error === "string", "400 carries an error message");
});

test("transferValidity aborts with 502 and uploads nothing when the old blob download fails", async () => {
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
  const deps2 = makeDeps(signer, storage);

  const oldDataHash = "0x" + "dd".repeat(32);
  const oldDataKey = crypto.getRandomValues(new Uint8Array(32));
  const sealedDek = sealKeyForReceiver(signer.uncompressedPubkey, oldDataKey);
  const sealedDataEncryptionKey = "0x" + Buffer.from(sealedDek).toString("hex");

  const input: TransferValidityInput = {
    oldDataHash: oldDataHash as `0x${string}`,
    oldDataUri: oldDataHash as `0x${string}`,
    targetPubkey64: receiverPubkeyHex as `0x${string}`,
    accessProofNonce: 1,
    to: "0x0000000000000000000000000000000000000001",
    nft: "0x0000000000000000000000000000000000000002",
    sealedDataEncryptionKey,
  };
  // E2: a failed download MUST abort the transfer — re-keying an empty blob would
  // silently destroy the token's stored data and sign proofs over fabricated content.
  await assert.rejects(transferValidity(deps2, input), (err: unknown) => {
    assert.ok(err instanceof OracleRequestError);
    assert.equal(err.status, 502);
    assert.match(err.message, /blob missing from storage/);
    return true;
  });
  assert.equal(
    uploaded.length,
    0,
    "no re-encrypted blob may be uploaded when the old blob cannot be downloaded",
  );
});
