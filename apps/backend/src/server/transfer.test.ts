import { aesGcmEncrypt, concatEncrypted } from "@axiom/oracle/crypto/aes-gcm";
import { unsealKeyForReceiver } from "@axiom/oracle/crypto/ecies";
import { randomBytes } from "node:crypto";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Express } from "express";
import express from "express";
import { Wallet, getBytes } from "ethers";

import { startServer as startBackendServer } from "../server.js";
import { startServer as startOracleServer } from "@axiom/oracle";
import { TeeSigner, accessMessageHash, deriveUncompressedPubkeyFromHex } from "@axiom/oracle/signer";
import { InMemoryStorage } from "@axiom/config/storage/0g";

const ORACLE_PRIV = "0x" + "11".repeat(32);
const BACKEND_PRIV = "0x" + "33".repeat(32);
const RECEIVER_PRIV = "0x" + "22".repeat(32);
const DATA_HASH = ("0x" + "aa".repeat(32)) as `0x${string}`;

function waitForListening(server: Server): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  server.once("listening", resolve);
  server.once("error", reject);
  return promise;
}

function waitForClose(server: Server): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  server.close((err) => {
    if (err) reject(err);
    else resolve();
  });
  return promise;
}

let oracleHttp: Server;
let oracleUrl: string;
let backendHttp: Server;
let backendUrl: string;
let receiverAddress: string;
let receiverPubkey64: `0x${string}`;

before(async () => {
  const oracleSigner = new TeeSigner(ORACLE_PRIV);
  const storage = new InMemoryStorage();

  const originalListen = express.application.listen;
  express.application.listen = function (this: Express, ...args: Parameters<typeof originalListen>) {
    oracleHttp = originalListen.apply(this, args);
    return oracleHttp;
  };
  startOracleServer({ signer: oracleSigner, storage, bind: "127.0.0.1", port: 0 });
  express.application.listen = originalListen;

  await waitForListening(oracleHttp);
  const addr = oracleHttp.address() as AddressInfo;
  oracleUrl = `http://127.0.0.1:${addr.port}`;

  // Register the dataHash so the oracle will sign for it.
  const mint = await fetch(`${oracleUrl}/v1/agents/mint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataHash: DATA_HASH }),
  });
  assert.equal(mint.status, 200);

  const receiver = new Wallet(RECEIVER_PRIV);
  receiverAddress = receiver.address;
  const uncompressed = deriveUncompressedPubkeyFromHex(RECEIVER_PRIV);
  receiverPubkey64 = ("0x" + Buffer.from(uncompressed).toString("hex")) as `0x${string}`;

  // Start the backend pointing at the test oracle.
  const backendSigner = new Wallet(BACKEND_PRIV);
  const backend = startBackendServer({
    bind: "127.0.0.1",
    port: 0,
    evmRpc: "http://127.0.0.1:1",
    signer: backendSigner,
    oracleBaseUrl: oracleUrl,
  });
  backendHttp = backend.httpServer;
  await waitForListening(backendHttp);
  const baddr = backendHttp.address() as AddressInfo;
  backendUrl = `http://127.0.0.1:${baddr.port}`;
});

after(async () => {
  if (backendHttp) {
    backendHttp.closeAllConnections?.();
    await waitForClose(backendHttp);
  }
  if (oracleHttp) {
    oracleHttp.closeAllConnections?.();
    await waitForClose(oracleHttp);
  }
});

test("POST /v1/agents/:id/transfer challenge returns ownership signature", async () => {
  const res = await fetch(`${backendUrl}/v1/agents/1/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: receiverAddress,
      receiverPubKey64: receiverPubkey64,
      accessProofNonce: "1",
      dataHash: DATA_HASH,
    }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    ok: boolean;
    stage: string;
    dataHash: string;
    targetPubkey: string;
    validUntil: string;
    ownershipSignature: string;
  };
  assert.equal(body.ok, true);
  assert.equal(body.stage, "challenge");
  assert.equal(body.dataHash, DATA_HASH);
  assert.equal(body.targetPubkey, receiverPubkey64);
  assert.match(body.ownershipSignature, /^0x[0-9a-fA-F]+$/);
  assert.equal((body.ownershipSignature.length - 2) / 2, 65);
});

test("POST /v1/agents/:id/transfer final returns full proof structs", async () => {
  // Challenge first to get the canonical validUntil.
  const challengeRes = await fetch(`${backendUrl}/v1/agents/1/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: receiverAddress,
      receiverPubKey64: receiverPubkey64,
      accessProofNonce: "2",
      dataHash: DATA_HASH,
    }),
  });
  assert.equal(challengeRes.status, 200);
  const challenge = (await challengeRes.json()) as {
    ok: boolean;
    stage: string;
    dataHash: string;
    targetPubkey: string;
    accessProofNonce: number;
    validUntil: string;
  };
  // Receiver signs the AccessProof digest via raw ECDSA (no EIP-191 prefix),
  // matching the on-chain ecrecover and the backend's SigningKey.recoverPublicKey.
  const nonce = BigInt(challenge.accessProofNonce);
  const validUntil = BigInt(challenge.validUntil);
  const digest = accessMessageHash({
    dataHash: challenge.dataHash as `0x${string}`,
    targetPubkey: challenge.targetPubkey as `0x${string}`,
    to: receiverAddress as `0x${string}`,
    nft: ("0x" + "0".repeat(40)) as `0x${string}`,
    nonce,
    validUntil,
  });
  const receiver = new Wallet(RECEIVER_PRIV);
  const accessSignature = receiver.signingKey.sign(getBytes(digest)).serialized;

  const finalRes = await fetch(`${backendUrl}/v1/agents/1/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: receiverAddress,
      receiverPubKey64: receiverPubkey64,
      dataHash: DATA_HASH,
      accessProof: {
        dataHash: challenge.dataHash,
        targetPubkey: challenge.targetPubkey,
        nonce: nonce.toString(),
        proof: accessSignature,
        validUntil: validUntil.toString(),
      },
    }),
  });
  assert.equal(finalRes.status, 200);
  const body = (await finalRes.json()) as {
    ok: boolean;
    stage: string;
    accessSigner: string;
    accessProof: { dataHash: string; targetPubkey: string; nonce: string; proof: string; validUntil: string };
    ownershipProof: {
      oracleType: number;
      dataHash: string;
      sealedKey: string;
      targetPubkey: string;
      nonce: string;
      proof: string;
      validUntil: string;
    };
  };
  assert.equal(body.ok, true);
  assert.equal(body.stage, "final");
  assert.equal(body.accessSigner.toLowerCase(), receiverAddress.toLowerCase());
  assert.equal(body.accessProof.dataHash, challenge.dataHash);
  assert.equal(body.accessProof.targetPubkey, challenge.targetPubkey);
  assert.equal(body.accessProof.nonce, nonce.toString());
  assert.equal(body.accessProof.proof, accessSignature);
  assert.equal(body.accessProof.validUntil, validUntil.toString());
  assert.equal(body.ownershipProof.oracleType, 0);
  assert.equal(body.ownershipProof.dataHash, challenge.dataHash);
  assert.equal(body.ownershipProof.targetPubkey, challenge.targetPubkey);
  assert.equal(body.ownershipProof.nonce, nonce.toString());
  assert.match(body.ownershipProof.proof, /^0x[0-9a-fA-F]+$/);
  assert.equal((body.ownershipProof.proof.length - 2) / 2, 65);
  assert.equal(body.ownershipProof.validUntil, validUntil.toString());
});


test("POST /v1/agents/:id/transfer challenge triggers full re-key via /v1/transfer-validity", async () => {
  // Stand up a dedicated oracle with a pre-populated ciphertext so the
  // /v1/transfer-validity handler can download, decrypt, re-encrypt, and
  // re-upload — exercising the real re-key path end-to-end.
  const oracleSigner = new TeeSigner(ORACLE_PRIV);
  const storage = new InMemoryStorage();

  // Encrypt a plaintext with a known AES-256 key, upload to oracle storage.
  const oldDataKey = new Uint8Array(randomBytes(32));
  const plaintext = new TextEncoder().encode("secret-strategy-v1");
  const enc = aesGcmEncrypt(oldDataKey, plaintext);
  const oldBlob = concatEncrypted(enc);
  const { rootHash: oldDataUri } = await storage.upload(oldBlob);
  // The on-chain dataHash for this test is the oldDataUri (0G root hash).
  storage.markDataHashSeen(oldDataUri);

  const origListen = express.application.listen;
  express.application.listen = function (this: Express, ...args: Parameters<typeof origListen>) {
    const s = origListen.apply(this, args);
    return s;
  };
  const oracleApp = startOracleServer({ signer: oracleSigner, storage, bind: "127.0.0.1", port: 0 });
  express.application.listen = origListen;
  const oracleSrv = oracleApp.listen(0, "127.0.0.1");
  await waitForListening(oracleSrv);
  const oAddr = oracleSrv.address() as AddressInfo;
  const rekeyOracleUrl = `http://127.0.0.1:${oAddr.port}`;

  const backendSigner = new Wallet(BACKEND_PRIV);
  const backend = startBackendServer({
    bind: "127.0.0.1",
    port: 0,
    evmRpc: "http://127.0.0.1:1",
    signer: backendSigner,
    oracleBaseUrl: rekeyOracleUrl,
  });
  const bSrv = backend.httpServer;
  await waitForListening(bSrv);
  const bAddr = bSrv.address() as AddressInfo;
  const rekeyBackendUrl = `http://127.0.0.1:${bAddr.port}`;

  try {
    const receiver = new Wallet(RECEIVER_PRIV);
    const uncompressed = deriveUncompressedPubkeyFromHex(RECEIVER_PRIV);
    const receiverPubkey64 = ("0x" + Buffer.from(uncompressed).toString("hex")) as `0x${string}`;

    // Challenge with re-key inputs — backend calls oracle /v1/transfer-validity.
    const challengeRes = await fetch(`${rekeyBackendUrl}/v1/agents/42/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: receiver.address,
        receiverPubKey64: receiverPubkey64,
        accessProofNonce: 7,
        dataHash: oldDataUri,
        oldDataUri,
        oldDataEncryptionKey: Buffer.from(oldDataKey).toString("base64"),
      }),
    });
    assert.equal(challengeRes.status, 200);
    const challenge = (await challengeRes.json()) as {
      ok: boolean;
      stage: string;
      dataHash: string;
      oldDataHash: string;
      newDataHash: string;
      newDataUri: string;
      targetPubkey: string;
      accessProofNonce: number;
      validUntil: string;
      sealedKey: string;
      ownershipSignature: string;
      rekeyed: boolean;
    };
    assert.equal(challenge.ok, true);
    assert.equal(challenge.stage, "challenge");
    assert.equal(challenge.rekeyed, true);
    // The OwnershipProof is signed over the OLD dataHash (on-chain single-field struct).
    assert.equal(challenge.dataHash, oldDataUri);
    assert.equal(challenge.oldDataHash, oldDataUri);
    // A new ciphertext was uploaded — newDataHash differs from oldDataUri.
    assert.notEqual(challenge.newDataHash, oldDataUri);
    assert.equal(challenge.newDataUri, challenge.newDataHash);
    // The re-keyed sealedKey is non-zero (real ECIES output, not the zero pad).
    assert.match(challenge.sealedKey, /^0x[0-9a-fA-F]+$/);
    assert.ok(challenge.sealedKey.length > 66, "sealedKey should be > 32 bytes (ECIES ciphertext)");
    // Receiver can unseal the new key — proves real re-keying + ECIES sealing.
    const sealedKeyBytes = getBytes(challenge.sealedKey as `0x${string}`);
    const recoveredKey = unsealKeyForReceiver(getBytes(RECEIVER_PRIV), sealedKeyBytes);
    assert.equal(recoveredKey.length, 32, "unsealed key must be 32-byte AES-256 key");

    // Final stage: receiver signs AccessProof, backend signs OwnershipProof
    // with the re-keyed sealedKey (passed back by the client).
    const nonce = BigInt(challenge.accessProofNonce);
    const validUntil = BigInt(challenge.validUntil);
    const digest = accessMessageHash({
      dataHash: challenge.dataHash as `0x${string}`,
      targetPubkey: challenge.targetPubkey as `0x${string}`,
      to: receiver.address as `0x${string}`,
      nft: ("0x" + "0".repeat(40)) as `0x${string}`,
      nonce,
      validUntil,
    });
    const accessSignature = receiver.signingKey.sign(getBytes(digest)).serialized;

    const finalRes = await fetch(`${rekeyBackendUrl}/v1/agents/42/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: receiver.address,
        receiverPubKey64: receiverPubkey64,
        dataHash: oldDataUri,
        sealedKey: challenge.sealedKey,
        accessProof: {
          dataHash: challenge.dataHash,
          targetPubkey: challenge.targetPubkey,
          nonce: nonce.toString(),
          proof: accessSignature,
          validUntil: validUntil.toString(),
        },
      }),
    });
    assert.equal(finalRes.status, 200);
    const final = (await finalRes.json()) as {
      ok: boolean;
      stage: string;
      accessSigner: string;
      ownershipProof: {
        oracleType: number;
        dataHash: string;
        sealedKey: string;
        targetPubkey: string;
        nonce: string;
        proof: string;
        validUntil: string;
      };
    };
    assert.equal(final.ok, true);
    assert.equal(final.stage, "final");
    assert.equal(final.accessSigner.toLowerCase(), receiver.address.toLowerCase());
    // The OwnershipProof uses the re-keyed sealedKey.
    assert.equal(final.ownershipProof.sealedKey, challenge.sealedKey);
    assert.equal(final.ownershipProof.dataHash, challenge.dataHash);
    assert.equal(final.ownershipProof.targetPubkey, challenge.targetPubkey);
    assert.equal(final.ownershipProof.nonce, nonce.toString());
    assert.match(final.ownershipProof.proof, /^0x[0-9a-fA-F]+$/);
    assert.equal((final.ownershipProof.proof.length - 2) / 2, 65);
  } finally {
    bSrv.closeAllConnections?.();
    await waitForClose(bSrv);
    oracleSrv.closeAllConnections?.();
    await waitForClose(oracleSrv);
  }
});