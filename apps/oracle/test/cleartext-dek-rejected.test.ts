/**
 * Regression: cleartext oldDataEncryptionKey is rejected when
 * AXIOM_ALLOW_CLEARTEXT_DEK is not enabled (production-shaped default).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { request, type Server, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { keccak256 } from "ethers";

import { InMemoryStorage } from "@axiom/config/storage/0g";
import { TeeSigner } from "../src/signer.js";
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
      hostname: "127.0.0.1",
      port: addr.port,
      path,
      method,
      headers: {
        "content-type": "application/json",
        "content-length": payload.length,
      },
    },
    (res: IncomingMessage) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c as Buffer));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed: unknown = text;
        try {
          parsed = JSON.parse(text);
        } catch {
          /* raw */
        }
        resolve({ status: res.statusCode ?? 0, body: parsed });
      });
    },
  );
  req.on("error", reject);
  req.write(payload);
  req.end();
  return promise;
}

let server: Server;
let storage: InMemoryStorage;

before(async () => {
  // Explicitly disable cleartext path for this suite.
  delete process.env.AXIOM_ALLOW_CLEARTEXT_DEK;
  process.env.AXIOM_DISABLE_AUTH = "true";
  process.env.NODE_ENV = "test";

  storage = new InMemoryStorage({
    seenHashesFile: `/tmp/oracle-cleartext-reject-${process.pid}.json`,
  });
  const signer = new TeeSigner(TEST_PRIV_HEX);
  const started = startServer({
    signer,
    storage,
    bind: "127.0.0.1",
    port: 0,
  });
  server = started.httpServer;
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
});

after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

test("cleartext oldDataEncryptionKey is rejected with 400 when flag unset", async () => {
  const aesKey = new Uint8Array(32).fill(0x09);
  const plaintext = new TextEncoder().encode("must not accept cleartext DEK");
  const enc = aesGcmEncrypt(aesKey, plaintext);
  const blob = concatEncrypted(enc);
  const oldDataHash = keccak256(blob) as `0x${string}`;
  await storage.upload(blob);

  const tvRes = await httpRequest(server, "POST", "/v1/transfer-validity", {
    oldDataHash,
    oldDataUri: oldDataHash,
    targetPubkey64: TEST_RECEIVER_PUBKEY_HEX,
    accessProofNonce: 0,
    ownershipProofNonce: 0,
    oldDataEncryptionKey: Buffer.from(aesKey).toString("base64"),
    to: "0x0000000000000000000000000000000000000001",
    nft: "0x0000000000000000000000000000000000000002",
  });

  assert.equal(tvRes.status, 400, JSON.stringify(tvRes.body));
  const err = (tvRes.body as { error?: string }).error ?? "";
  assert.match(
    err,
    /sealedDataEncryptionKey|cleartext|rejected/i,
    `unexpected error: ${err}`,
  );
});
