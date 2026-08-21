process.env.AXIOM_ALLOW_CLEARTEXT_DEK = "true";

import { test, beforeAll, afterAll } from "bun:test";
import assert from "node:assert/strict";
import { request, type Server, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { SigningKey, keccak256, toBeHex, zeroPadValue } from "ethers";
import express from "express";

import { InMemoryStorage } from "@axiom/config/storage/0g";
import { TeeSigner } from "../oracle/signer.js";
import type { BackendEnv } from "../env-schema.js";
import { ownershipMessageHash } from "@axiom/config/eip712";
import {
  registerOracleRoutes,
  transferValidity,
  signOwnership,
  OracleRequestError,
  type OracleRouteDeps,
} from "../oracle/routes.js";
import { aesGcmEncrypt, concatEncrypted } from "@axiom/config/crypto/aes-gcm";
import { publicKeyUncompressedFromPrivate } from "@axiom/config/crypto/keys";
import { ARISTOTLE_CHAIN_ID } from "@axiom/config";

const TEST_PRIV_HEX = "0x" + "11".repeat(32);
const TEST_RECEIVER_PRIV_HEX = "0x" + "22".repeat(32);

const TEST_RECEIVER_PUBKEY_HEX = ("0x" +
  Buffer.from(
    publicKeyUncompressedFromPrivate(
      new Uint8Array(Buffer.from(TEST_RECEIVER_PRIV_HEX.slice(2), "hex")),
    ),
  ).toString("hex")) as `0x${string}`;
const TEST_SEALED_KEY = ("0x" + "22".repeat(32)) as `0x${string}`;
const UNKNOWN_DATA_HASH = ("0x" + "ab".repeat(32)) as `0x${string}`;
const REGISTERED_DATA_HASH = ("0x" + "cd".repeat(32)) as `0x${string}`;
const MOCK_VERIFIER = ("0x" + "00".repeat(19) + "03") as `0x${string}`;

interface HttpResult {
  status: number;
  body: unknown;
}

function httpRequest(
  server: Server,
  method: string,
  path: string,
  body: unknown,
): Promise<HttpResult> {
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
          } catch {
            parsed = text; // non-JSON body — keep raw text
          }
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
let deps: OracleRouteDeps;

beforeAll(async () => {
  signer = new TeeSigner(TEST_PRIV_HEX);
  storage = new InMemoryStorage();
  deps = {
    signer,
    storage,
    chainId: BigInt(ARISTOTLE_CHAIN_ID),
    verifier: MOCK_VERIFIER,
    env: {
      AXIOM_ALLOW_CLEARTEXT_DEK: "true",
      NODE_ENV: "test",
    } as unknown as BackendEnv,
  };
  const app = express();
  app.use(express.json());
  registerOracleRoutes(app, deps);
  server = app.listen(0, "127.0.0.1");
  server.unref();
  await new Promise<void>((resolve) => {
    server.once("listening", () => resolve());
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
});

test("unknown_dataHash_returns_400", async () => {
  await assert.rejects(
    signOwnership(deps, {
      dataHash: UNKNOWN_DATA_HASH,
      targetPubkey: TEST_RECEIVER_PUBKEY_HEX,
      sealedKey: TEST_SEALED_KEY,
      to: "0x0000000000000000000000000000000000000001",
      nft: "0x0000000000000000000000000000000000000002",
      nonce: 1,
    }),
    (err: unknown) => {
      assert.ok(err instanceof OracleRequestError);
      assert.equal(err.status, 400);
      assert.match(err.message, /Unknown dataHash/i);
      return true;
    },
  );
});

test("dataHash_registered_via_agents_mint_succeeds", async () => {
  const regRes = await httpRequest(server, "POST", "/oracle/v1/agents/mint", {
    dataHash: REGISTERED_DATA_HASH,
  });
  assert.equal(
    regRes.status,
    200,
    `expected 200 from /oracle/v1/agents/mint but got ${regRes.status}`,
  );
  const regBody = regRes.body as {
    ok: boolean;
    dataHash: string;
    seen: boolean;
  };
  assert.equal(regBody.ok, true);
  assert.equal(regBody.dataHash, REGISTERED_DATA_HASH);
  assert.equal(regBody.seen, true);

  const ownResult = await signOwnership(deps, {
    dataHash: REGISTERED_DATA_HASH,
    targetPubkey: TEST_RECEIVER_PUBKEY_HEX,
    sealedKey: TEST_SEALED_KEY,
    to: "0x0000000000000000000000000000000000000001",
    nft: "0x0000000000000000000000000000000000000002",
    nonce: 7,
  });
  assert.match(ownResult.signature, /^0x[0-9a-fA-F]+$/);
  assert.equal(
    (ownResult.signature.length - 2) / 2,
    65,
    "signature is 65 bytes (r || s || v)",
  );

  const validUntil = BigInt(ownResult.validUntil);
  const localDigest = ownershipMessageHash({
    dataHash: REGISTERED_DATA_HASH,
    sealedKey: TEST_SEALED_KEY,
    targetPubkey: TEST_RECEIVER_PUBKEY_HEX,
    to: "0x0000000000000000000000000000000000000001",
    nft: "0x0000000000000000000000000000000000000002",
    nonce: zeroPadValue(toBeHex(7n), 32) as `0x${string}`,
    validUntil,
  });
  const localSig = signer.signOwnership({
    dataHash: REGISTERED_DATA_HASH,
    sealedKey: TEST_SEALED_KEY,
    targetPubkey: TEST_RECEIVER_PUBKEY_HEX,
    to: "0x0000000000000000000000000000000000000001",
    nft: "0x0000000000000000000000000000000000000002",
    nonce: zeroPadValue(toBeHex(7n), 32) as `0x${string}`,
    validUntil,
  });
  assert.equal(
    localSig,
    ownResult.signature,
    "server-produced signature matches locally re-signed one (deterministic k)",
  );

  const recovered = SigningKey.recoverPublicKey(
    localDigest,
    ownResult.signature,
  );
  const recoveredBytes = Uint8Array.from(
    Buffer.from(recovered.slice(2), "hex"),
  );
  const recoveredXy = recoveredBytes.slice(1);
  const addrFromXY = "0x" + keccak256(recoveredXy).slice(-40);
  assert.equal(
    addrFromXY.toLowerCase(),
    ownResult.signer.toLowerCase(),
    "recovered address matches the configured TEE signer",
  );
});

test("dataHash_observed_via_transfer_validity_succeeds", async () => {
  const aesKey = new Uint8Array(32).fill(0x07);
  const plaintext = new TextEncoder().encode(
    "Wave 6 A transfer-validity roundtrip",
  );
  const enc = aesGcmEncrypt(aesKey, plaintext);
  const blob = concatEncrypted(enc);
  const oldDataHash = keccak256(blob) as `0x${string}`;
  const oldDataEncryptionKey = Buffer.from(aesKey).toString("base64");

  await storage.upload(blob);
  const tvResult = await transferValidity(deps, {
    oldDataHash,
    oldDataUri: oldDataHash,
    targetPubkey64: TEST_RECEIVER_PUBKEY_HEX,
    accessProofNonce: 0,
    ownershipProofNonce: 0,
    oldDataEncryptionKey,
    to: "0x0000000000000000000000000000000000000001",
    nft: "0x0000000000000000000000000000000000000002",
  });
  assert.equal(tvResult.newDataHash, tvResult.newDataUri);

  const ownResult = await signOwnership(deps, {
    dataHash: tvResult.newDataHash,
    targetPubkey: TEST_RECEIVER_PUBKEY_HEX,
    sealedKey: TEST_SEALED_KEY,
    to: "0x0000000000000000000000000000000000000001",
    nft: "0x0000000000000000000000000000000000000002",
    nonce: 11,
  });
  assert.match(ownResult.signature, /^0x[0-9a-fA-F]+$/);
  assert.equal(
    (ownResult.signature.length - 2) / 2,
    65,
    "signature is 65 bytes (r || s || v)",
  );
  assert.ok(
    ownResult.signer.startsWith("0x"),
    "signer field is a 0x-prefixed address",
  );
});
