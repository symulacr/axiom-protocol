process.env.AXIOM_ALLOW_CLEARTEXT_DEK = "true";
process.env.AXIOM_DISABLE_AUTH = "true";

import { randomBytes } from "node:crypto";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Wallet, getBytes } from "ethers";

import { startServer as startBackendServer, type ServerConfig } from "../server.js";
import { fetchJson } from "../utils/fetch-json.js";
import { startServer as startOracleServer } from "@axiom/oracle/server";
import { TeeSigner } from "@axiom/oracle/signer";
import { accessMessageHash, deriveUncompressedPubkeyFromHex, buildEip712Domain, ARISTOTLE_CHAIN_ID, aesGcmEncrypt, concatEncrypted, unsealKeyForReceiver } from "@axiom/config";
import { sealKeyForReceiver } from "@axiom/config/crypto/keys";
import { InMemoryStorage } from "@axiom/config/storage/0g";

const ORACLE_PRIV = "0x" + "11".repeat(32);
const BACKEND_PRIV = "0x" + "33".repeat(32);
const RECEIVER_PRIV = "0x" + "22".repeat(32);
const DATA_HASH = ("0x" + "aa".repeat(32)) as `0x${string}`;
const MOCK_ADDRESSES = {
  agentNft: ("0x" + "00".repeat(19) + "01") as `0x${string}`,
  vault: ("0x" + "00".repeat(19) + "02") as `0x${string}`,
  verifier: ("0x" + "00".repeat(19) + "03") as `0x${string}`,
};

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
  const oracleSigner = new TeeSigner(
    ORACLE_PRIV,
    buildEip712Domain(ARISTOTLE_CHAIN_ID, MOCK_ADDRESSES.verifier),
  );
  const storage = new InMemoryStorage();

  const { httpServer: oSrv } = startOracleServer({ signer: oracleSigner, storage, bind: "127.0.0.1", port: 0 });
  oracleHttp = oSrv;

  await waitForListening(oracleHttp);
  const addr = oracleHttp.address() as AddressInfo;
  oracleUrl = `http://127.0.0.1:${addr.port}`;

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

  const backendSigner = new Wallet(BACKEND_PRIV);
  const backend = startBackendServer({
    bind: "127.0.0.1",
    port: 0,
    evmRpc: "http://127.0.0.1:1",
    signer: backendSigner,
    oracleBaseUrl: oracleUrl,
    addresses: MOCK_ADDRESSES,
    // The backend must be configured to trust the oracle's TEE signer, or
    // every ownership proof is rejected (502). The test oracle signs with
    // ORACLE_PRIV, so the trusted signer is derived from it.
    env: { AXIOM_TEE_SIGNER_PK: ORACLE_PRIV } as unknown as ServerConfig["env"],
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
  const { ok, status, data: body } = await fetchJson<{
    ok: boolean;
    stage: string;
    dataHash: string;
    targetPubkey: string;
    validUntil: string;
    ownershipSignature: string;
  }>(`${backendUrl}/v1/agents/1/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: receiverAddress,
      receiverPubKey64: receiverPubkey64,
      accessProofNonce: "1",
      dataHash: DATA_HASH,
    }),
  });
  assert.equal(status, 200);
  assert.equal(ok, true);
  assert.equal(body.ok, true);
  assert.equal(body.stage, "challenge");
  assert.equal(body.dataHash, DATA_HASH);
  assert.equal(body.targetPubkey, receiverPubkey64);
  assert.match(body.ownershipSignature, /^0x[0-9a-fA-F]+$/);
  assert.equal((body.ownershipSignature.length - 2) / 2, 65);
});

test("POST /v1/agents/:id/transfer final returns full proof structs", async () => {
  const {
    ok: challengeOk,
    status: challengeStatus,
    data: challenge,
  } = await fetchJson<{
    ok: boolean;
    stage: string;
    dataHash: string;
    targetPubkey: string;
    accessProofNonce: number;
    validUntil: string;
  }>(`${backendUrl}/v1/agents/1/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: receiverAddress,
      receiverPubKey64: receiverPubkey64,
      accessProofNonce: "2",
      dataHash: DATA_HASH,
    }),
  });
  assert.equal(challengeStatus, 200);
  assert.equal(challengeOk, true);
  const testDomain = buildEip712Domain(ARISTOTLE_CHAIN_ID, MOCK_ADDRESSES.verifier);

  const nonce = BigInt(challenge.accessProofNonce);
  const validUntil = BigInt(challenge.validUntil);
  const digest = accessMessageHash({
    dataHash: challenge.dataHash as `0x${string}`,
    targetPubkey: challenge.targetPubkey as `0x${string}`,
    to: receiverAddress as `0x${string}`,
    nft: MOCK_ADDRESSES.agentNft,
    nonce,
    validUntil,
  }, testDomain);
  const receiver = new Wallet(RECEIVER_PRIV);
  const accessSignature = receiver.signingKey.sign(getBytes(digest)).serialized;

  const { ok: finalOk, status: finalStatus, data: body } = await fetchJson<{
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
  }>(`${backendUrl}/v1/agents/1/transfer`, {
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
  assert.equal(finalStatus, 200);
  assert.equal(finalOk, true);
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
  const oracleSigner = new TeeSigner(
    ORACLE_PRIV,
    buildEip712Domain(ARISTOTLE_CHAIN_ID, MOCK_ADDRESSES.verifier),
  );
  const storage = new InMemoryStorage();

  const oldDataKey = new Uint8Array(randomBytes(32));
  const plaintext = new TextEncoder().encode("secret-strategy-v1");
  const enc = aesGcmEncrypt(oldDataKey, plaintext);
  const oldBlob = concatEncrypted(enc);
  const { rootHash: oldDataUri } = await storage.upload(oldBlob);
  storage.markDataHashSeen(oldDataUri);

  const { httpServer: oracleSrv } = startOracleServer({ signer: oracleSigner, storage, bind: "127.0.0.1", port: 0 });
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
    addresses: MOCK_ADDRESSES,
    env: { AXIOM_TEE_SIGNER_PK: ORACLE_PRIV } as unknown as ServerConfig["env"],
  });
  const bSrv = backend.httpServer;
  await waitForListening(bSrv);
  const bAddr = bSrv.address() as AddressInfo;
  const rekeyBackendUrl = `http://127.0.0.1:${bAddr.port}`;

  try {
    const receiver = new Wallet(RECEIVER_PRIV);
    const uncompressed = deriveUncompressedPubkeyFromHex(RECEIVER_PRIV);
    const receiverPubkey64 = ("0x" + Buffer.from(uncompressed).toString("hex")) as `0x${string}`;

    // Seal DEK to oracle TEE pubkey (cleartext rejected on backend + oracle).
    const sealedDek = sealKeyForReceiver(
      oracleSigner.uncompressedPubkey,
      oldDataKey,
    );
    const sealedDataEncryptionKey =
      "0x" + Buffer.from(sealedDek).toString("hex");

    const {
      ok: rekeyChallengeOk,
      status: rekeyChallengeStatus,
      data: challenge,
    } = await fetchJson<{
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
    }>(`${rekeyBackendUrl}/v1/agents/42/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: receiver.address,
        receiverPubKey64: receiverPubkey64,
        accessProofNonce: 7,
        dataHash: oldDataUri,
        oldDataUri,
        sealedDataEncryptionKey,
      }),
    });
    assert.equal(rekeyChallengeStatus, 200);
    assert.equal(rekeyChallengeOk, true);
    assert.equal(challenge.ok, true);
    assert.equal(challenge.stage, "challenge");
    assert.equal(challenge.rekeyed, true);
    assert.equal(challenge.dataHash, oldDataUri);
    assert.equal(challenge.oldDataHash, oldDataUri);
    assert.notEqual(challenge.newDataHash, oldDataUri);
    assert.equal(challenge.newDataUri, challenge.newDataHash);
    assert.match(challenge.sealedKey, /^0x[0-9a-fA-F]+$/);
    assert.ok(challenge.sealedKey.length > 66, "sealedKey should be > 32 bytes (ECIES ciphertext)");
    const sealedKeyBytes = getBytes(challenge.sealedKey as `0x${string}`);
    const recoveredKey = unsealKeyForReceiver(getBytes(RECEIVER_PRIV), sealedKeyBytes);
    assert.equal(recoveredKey.length, 32, "unsealed key must be 32-byte AES-256 key");
    const testDomain = buildEip712Domain(ARISTOTLE_CHAIN_ID, MOCK_ADDRESSES.verifier);

    const nonce = BigInt(challenge.accessProofNonce);
    const validUntil = BigInt(challenge.validUntil);
    const digest = accessMessageHash({
      dataHash: challenge.dataHash as `0x${string}`,
      targetPubkey: challenge.targetPubkey as `0x${string}`,
      to: receiver.address as `0x${string}`,
      nft: MOCK_ADDRESSES.agentNft,
      nonce,
      validUntil,
    }, testDomain);
    const accessSignature = receiver.signingKey.sign(getBytes(digest)).serialized;

    const {
      ok: rekeyFinalOk,
      status: rekeyFinalStatus,
      data: final,
    } = await fetchJson<{
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
    }>(`${rekeyBackendUrl}/v1/agents/42/transfer`, {
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
    assert.equal(rekeyFinalStatus, 200);
    assert.equal(rekeyFinalOk, true);
    assert.equal(final.ok, true);
    assert.equal(final.stage, "final");
    assert.equal(final.accessSigner.toLowerCase(), receiver.address.toLowerCase());
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
