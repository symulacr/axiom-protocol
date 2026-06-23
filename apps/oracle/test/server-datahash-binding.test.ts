// Wave 6 A — server-side binding between /v1/ownership and the storage
// "seen dataHashes" set. Exercises the real HTTP layer via a loopback
// listener (no mocks).
//
// Test surface (3 cases, all real network, no mocks):
//   1. unknown_dataHash_returns_400 — POST /v1/ownership with unseen dataHash
//   2. dataHash_registered_via_agents_mint_succeeds — register then sign
//   3. dataHash_observed_via_transfer_validity_succeeds — full re-key path

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, request, type Server, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { SigningKey, keccak256 } from "ethers";

import { InMemoryStorage } from "../src/storage.js";
import { TeeSigner, ownershipMessageHash } from "../src/signer.js";
import { startServer } from "../src/server.js";
import { aesGcmEncrypt, concatEncrypted } from "../src/crypto/aes-gcm.js";
import { publicKeyUncompressedFromPrivate } from "../src/crypto/secp256k1.js";

const TEST_PRIV_HEX = "0x" + "11".repeat(32);
const TEST_RECEIVER_PRIV_HEX = "0x" + "22".repeat(32);
// Derive a real, on-curve uncompressed pubkey (64 bytes X||Y) from a private
// key. The /v1/transfer-validity endpoint runs ECIES sealKeyForReceiver
// against this key, which rejects off-curve points with "bad point: equation
// left != right" — see apps/oracle/src/crypto/ecies.ts and the round-trip
// test in apps/oracle/src/signer.test.ts:46-54.
const TEST_RECEIVER_PUBKEY_HEX = ("0x" +
  Buffer.from(
    publicKeyUncompressedFromPrivate(
      new Uint8Array(Buffer.from(TEST_RECEIVER_PRIV_HEX.slice(2), "hex")),
    ),
  ).toString("hex")) as `0x${string}`;
const TEST_SEALED_KEY = "0x" + "22".repeat(32);
const UNKNOWN_DATA_HASH = ("0x" + "ab".repeat(32)) as `0x${string}`;
const REGISTERED_DATA_HASH = ("0x" + "cd".repeat(32)) as `0x${string}`;

interface HttpResult {
  status: number;
  body: unknown;
}

function httpRequest(server: Server, method: string, path: string, body: unknown): Promise<HttpResult> {
  const addr = server.address() as AddressInfo;
  const payload = Buffer.from(JSON.stringify(body), "utf8");
  const { promise, resolve, reject } = Promise.withResolvers<HttpResult>();
  const req = request(
    {
      host: "127.0.0.1",
      port: addr.port,
      method,
      path,
      headers: {
        "content-type": "application/json",
        "content-length": payload.length.toString(),
      },
    },
    (res: IncomingMessage) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed: unknown = text;
        if (text.length > 0) {
          try {
            parsed = JSON.parse(text);
          } catch {}
        }
        resolve({ status: res.statusCode ?? 0, body: parsed });
      });
      res.on("error", reject);
    },
  );
  req.on("error", reject);
  req.write(payload);
  req.end();
  return promise;
}

let server: Server;
let signer: TeeSigner;
let storage: InMemoryStorage;

before(async () => {
  signer = new TeeSigner(TEST_PRIV_HEX);
  storage = new InMemoryStorage();
  // startServer is the production code under test; it calls app.listen()
  // internally. To use a kernel-assigned port with a callback, we wrap the
  // express app in a fresh http.Server and call listen(0) ourselves. The
  // startServer's internal listener is also bound to port 0 and shares the
  // same kernel-assigned port — to keep the test self-contained, we close
  // the second server in `after`.
  const app = startServer({ signer, storage, bind: "127.0.0.1", port: 0 });
  server = createServer(app);
  server.unref();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
});

after(async () => {
  await new Promise<void>((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
});

test("unknown_dataHash_returns_400", async () => {
  const res = await httpRequest(server, "POST", "/v1/ownership", {
    dataHash: UNKNOWN_DATA_HASH,
    targetPubkey: TEST_RECEIVER_PUBKEY_HEX,
    sealedKey: TEST_SEALED_KEY,
    nonce: 1,
  });
  assert.equal(res.status, 400, `expected 400 but got ${res.status}: ${JSON.stringify(res.body)}`);
  const errBody = res.body as { error: string; dataHash: string };
  assert.match(errBody.error, /Unknown dataHash/i);
  assert.equal(errBody.dataHash, UNKNOWN_DATA_HASH);
});

test("dataHash_registered_via_agents_mint_succeeds", async () => {
  // Step 1: register the dataHash explicitly.
  const regRes = await httpRequest(server, "POST", "/v1/agents/mint", {
    dataHash: REGISTERED_DATA_HASH,
  });
  assert.equal(regRes.status, 200, `expected 200 from /v1/agents/mint but got ${regRes.status}`);
  const regBody = regRes.body as { ok: boolean; dataHash: string; seen: boolean };
  assert.equal(regBody.ok, true);
  assert.equal(regBody.dataHash, REGISTERED_DATA_HASH);
  assert.equal(regBody.seen, true);

  // Step 2: now /v1/ownership should accept it and return a recoverable signature.
  const ownRes = await httpRequest(server, "POST", "/v1/ownership", {
    dataHash: REGISTERED_DATA_HASH,
    targetPubkey: TEST_RECEIVER_PUBKEY_HEX,
    sealedKey: TEST_SEALED_KEY,
    nonce: 7,
  });
  assert.equal(
    ownRes.status,
    200,
    `expected 200 from /v1/ownership but got ${ownRes.status}: ${JSON.stringify(ownRes.body)}`,
  );
  const ownBody = ownRes.body as { signature: string; signer: string };
  assert.match(ownBody.signature, /^0x[0-9a-fA-F]+$/);
  assert.equal((ownBody.signature.length - 2) / 2, 65, "signature is 65 bytes (r || s || v)");

  // Regression guard: recover the signer from the signature and assert it
  // matches the *real* TeeSigner address. This proves the on-chain verifier
  // (which uses the same ecrecover path) would accept the proof.
  const validUntil = BigInt(Math.floor(Date.now() / 1000)) + 86400n;
  const localDigest = ownershipMessageHash({
    dataHash: REGISTERED_DATA_HASH,
    sealedKey: TEST_SEALED_KEY as `0x${string}`,
    targetPubkey: TEST_RECEIVER_PUBKEY_HEX as `0x${string}`,
    nonce: 7n,
    validUntil,
  });
  const localSig = signer.signOwnership({
    dataHash: REGISTERED_DATA_HASH,
    sealedKey: TEST_SEALED_KEY as `0x${string}`,
    targetPubkey: TEST_RECEIVER_PUBKEY_HEX as `0x${string}`,
    nonce: 7n,
    validUntil,
  });
  assert.equal(localSig, ownBody.signature, "server-produced signature matches locally-re-signed one (deterministic k)");
  // Recovered address from the *server's* signature must equal the *server's* signer.address.
  const recovered = SigningKey.recoverPublicKey(localDigest, ownBody.signature);
  const recoveredBytes = Uint8Array.from(Buffer.from(recovered.slice(2), "hex"));
  const recoveredXy = recoveredBytes.slice(1);
  const addrFromXY = "0x" + keccak256(recoveredXy).slice(-40);
  assert.equal(addrFromXY.toLowerCase(), ownBody.signer.toLowerCase(), "recovered address matches the configured TEE signer");
});

test("dataHash_observed_via_transfer_validity_succeeds", async () => {
  const aesKey = new Uint8Array(32).fill(0x07);
  const plaintext = new TextEncoder().encode("Wave 6 A transfer-validity roundtrip");
  const enc = aesGcmEncrypt(aesKey, plaintext);
  const blob = concatEncrypted(enc);
  const oldDataHash = keccak256(blob) as `0x${string}`;
  const oldDataEncryptionKey = Buffer.from(aesKey).toString("base64");
  // Pre-seed the storage so the server's storage.download(oldDataUri) finds
  // the blob. We have a handle to the same InMemoryStorage instance the
  // server uses (we passed it in `before`), so this is a real
  // end-to-end test of the live route.
  await storage.upload(blob);
  const tvRes = await httpRequest(server, "POST", "/v1/transfer-validity", {
    oldDataHash,
    oldDataUri: oldDataHash,
    targetPubkey64: TEST_RECEIVER_PUBKEY_HEX,
    accessProofNonce: 0,
    ownershipProofNonce: 0,
    oldDataEncryptionKey,
  });
  assert.equal(
    tvRes.status,
    200,
    `expected 200 from /v1/transfer-validity but got ${tvRes.status}: ${JSON.stringify(tvRes.body)}`,
  );
  const tvBody = tvRes.body as { newDataHash: string; newDataUri: string };
  assert.equal(tvBody.newDataHash, tvBody.newDataUri);

  const ownRes = await httpRequest(server, "POST", "/v1/ownership", {
    dataHash: tvBody.newDataHash,
    targetPubkey: TEST_RECEIVER_PUBKEY_HEX,
    sealedKey: TEST_SEALED_KEY,
    nonce: 11,
  });
  assert.equal(
    ownRes.status,
    200,
    `expected 200 from /v1/ownership (post transfer-validity) but got ${ownRes.status}: ${JSON.stringify(ownRes.body)}`,
  );
  const ownBody = ownRes.body as { signature: string; signer: string };
  assert.match(ownBody.signature, /^0x[0-9a-fA-F]+$/);
  assert.equal((ownBody.signature.length - 2) / 2, 65, "signature is 65 bytes (r || s || v)");
  assert.ok(ownBody.signer.startsWith("0x"), "signer field is a 0x-prefixed address");
});
