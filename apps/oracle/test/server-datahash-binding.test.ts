process.env.AXIOM_ALLOW_CLEARTEXT_DEK = "true";









import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { request, type Server, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { SigningKey, keccak256 } from "ethers";

import { InMemoryStorage } from "@axiom/config/storage/0g";
import { TeeSigner, ownershipMessageHash } from "../src/signer.js";
import { startServer } from "../src/server.js";
import { aesGcmEncrypt, concatEncrypted } from "@axiom/config/crypto/aes-gcm";
import { publicKeyUncompressedFromPrivate } from "@axiom/config/crypto/keys";

const TEST_PRIV_HEX = "0x" + "11".repeat(32);
const TEST_RECEIVER_PRIV_HEX = "0x" + "22".repeat(32);





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
  const startResult = startServer({ signer, storage, bind: "127.0.0.1", port: 0 });
  server = startResult.httpServer;
  server.unref();
  await new Promise<void>((resolve) => {
    server.once("listening", () => resolve());
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
    to: "0x0000000000000000000000000000000000000001",
    nft: "0x0000000000000000000000000000000000000002",
    nonce: 1,
  });
  assert.equal(res.status, 400, `expected 400 but got ${res.status}: ${JSON.stringify(res.body)}`);
  const errBody = res.body as { error: string; dataHash: string };
  assert.match(errBody.error, /Unknown dataHash/i);
  assert.equal(errBody.dataHash, UNKNOWN_DATA_HASH);
});

test("dataHash_registered_via_agents_mint_succeeds", async () => {
  
  const regRes = await httpRequest(server, "POST", "/v1/agents/mint", {
    dataHash: REGISTERED_DATA_HASH,
  });
  assert.equal(regRes.status, 200, `expected 200 from /v1/agents/mint but got ${regRes.status}`);
  const regBody = regRes.body as { ok: boolean; dataHash: string; seen: boolean };
  assert.equal(regBody.ok, true);
  assert.equal(regBody.dataHash, REGISTERED_DATA_HASH);
  assert.equal(regBody.seen, true);

  
  const ownRes = await httpRequest(server, "POST", "/v1/ownership", {
    dataHash: REGISTERED_DATA_HASH,
    targetPubkey: TEST_RECEIVER_PUBKEY_HEX,
    sealedKey: TEST_SEALED_KEY,
    to: "0x0000000000000000000000000000000000000001",
    nft: "0x0000000000000000000000000000000000000002",
    nonce: 7,
  });
  assert.equal(
    ownRes.status,
    200,
    `expected 200 from /v1/ownership but got ${ownRes.status}: ${JSON.stringify(ownRes.body)}`,
  );
  const ownBody = ownRes.body as { signature: string; signer: string; validUntil: string };
  assert.match(ownBody.signature, /^0x[0-9a-fA-F]+$/);
  assert.equal((ownBody.signature.length - 2) / 2, 65, "signature is 65 bytes (r || s || v)");

  
  
  
  const validUntil = BigInt(ownBody.validUntil);
  const localDigest = ownershipMessageHash({
    dataHash: REGISTERED_DATA_HASH,
    sealedKey: TEST_SEALED_KEY as `0x${string}`,
    targetPubkey: TEST_RECEIVER_PUBKEY_HEX as `0x${string}`,
    to: "0x0000000000000000000000000000000000000001" as `0x${string}`,
    nft: "0x0000000000000000000000000000000000000002" as `0x${string}`,
    nonce: 7n,
    validUntil,
  });
  const localSig = signer.signOwnership({
    dataHash: REGISTERED_DATA_HASH,
    sealedKey: TEST_SEALED_KEY as `0x${string}`,
    targetPubkey: TEST_RECEIVER_PUBKEY_HEX as `0x${string}`,
    to: "0x0000000000000000000000000000000000000001" as `0x${string}`,
    nft: "0x0000000000000000000000000000000000000002" as `0x${string}`,
    nonce: 7n,
    validUntil,
  });
  assert.equal(localSig, ownBody.signature, "server-produced signature matches locally-re-signed one (deterministic k)");
  
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
  
  
  
  
  await storage.upload(blob);
  const tvRes = await httpRequest(server, "POST", "/v1/transfer-validity", {
    oldDataHash,
    oldDataUri: oldDataHash,
    targetPubkey64: TEST_RECEIVER_PUBKEY_HEX,
    accessProofNonce: 0,
    ownershipProofNonce: 0,
    oldDataEncryptionKey,
    to: "0x0000000000000000000000000000000000000001",
    nft: "0x0000000000000000000000000000000000000002",
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
    to: "0x0000000000000000000000000000000000000001",
    nft: "0x0000000000000000000000000000000000000002",
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
