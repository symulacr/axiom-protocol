// Sealed-DEK custody tests (proto option C / ADR-004 §2.4) — env-flag matrix:
// ON: mint-time upload, senderless transfer re-keys from custody + row deleted;
// missing row → typed 400 telling the sender to provide the DEK.
// OFF: sender-provided path unchanged; custody upload refused; lookup never happens.
process.env.AXIOM_DISABLE_AUTH = "true";
process.env.AXIOM_DATA_DIR = join(tmpdir(), `axiom-dek-${process.pid}`);

import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, describe, beforeAll, afterAll } from "bun:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Wallet } from "ethers";

import { startServer, type ServerConfig } from "../server.js";
import { fetchJson } from "../utils/response.js";
import { TeeSigner } from "../oracle/signer.js";
import { DekCustodyStore } from "../oracle/storage.js";
import {
  buildEip712Domain,
  ARISTOTLE_CHAIN_ID,
  aesGcmEncrypt,
  concatEncrypted,
  deriveUncompressedPubkeyFromHex,
} from "@axiom/config";
import { sealKeyForReceiver } from "@axiom/config/crypto/keys";
import { InMemoryStorage } from "@axiom/config/storage/0g";

const ORACLE_PRIV = "0x" + "11".repeat(32);
const BACKEND_PRIV = "0x" + "33".repeat(32);
const RECEIVER_PRIV = "0x" + "22".repeat(32);
const MOCK_ADDRESSES = {
  agentNft: ("0x" + "00".repeat(19) + "01") as `0x${string}`,
  vault: ("0x" + "00".repeat(19) + "02") as `0x${string}`,
  verifier: ("0x" + "00".repeat(19) + "03") as `0x${string}`,
};

const oracleSigner = new TeeSigner(
  ORACLE_PRIV,
  buildEip712Domain(ARISTOTLE_CHAIN_ID, MOCK_ADDRESSES.verifier),
);

interface Backend {
  httpServer: Server;
  url: string;
  storage: InMemoryStorage;
  custody?: DekCustodyStore;
}

function waitForListening(server: Server): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  server.once("listening", resolve);
  server.once("error", reject);
  return promise;
}

async function waitForClose(server: Server): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  if (!server.listening) {
    resolve();
    return;
  }
  server.closeAllConnections?.();
  server.close(() => resolve());
  await promise;
}

function start(custodyEnv: "true" | "false" | undefined): Backend {
  const storage = new InMemoryStorage();
  const backend = startServer({
    bind: "127.0.0.1",
    port: 0,
    evmRpc: "http://127.0.0.1:1",
    signer: new Wallet(BACKEND_PRIV),
    chatStorage: storage,
    addresses: MOCK_ADDRESSES,
    env: {
      AXIOM_TEE_SIGNER_PK: ORACLE_PRIV,
      AXIOM_DEK_CUSTODY: custodyEnv,
    } as unknown as ServerConfig["env"],
  });
  // server.ts stashes the live oracleDeps on the factory — grab the vault
  // instance the routes actually use (flag off → undefined).
  const custody = (
    startServer as unknown as {
      __lastOracleDeps?: { dekCustody?: DekCustodyStore };
    }
  ).__lastOracleDeps?.dekCustody;
  return {
    httpServer: backend.httpServer,
    url: "",
    storage,
    custody,
  };
}

async function uploadSealedDek(
  url: string,
  tokenId: string,
  dek: Uint8Array,
): Promise<{ status: number; error?: string }> {
  const sealedDek = sealKeyForReceiver(oracleSigner.uncompressedPubkey, dek);
  const res = await fetch(`${url}/oracle/v1/agents/mint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dataHash: DATA_HASH,
      tokenId,
      sealedDataEncryptionKey: "0x" + Buffer.from(sealedDek).toString("hex"),
    }),
  });
  const data = (await res.json()) as { error?: string };
  return { status: res.status, error: data.error };
}

/** Re-keys an uploaded blob under `dek` and registers it with the oracle. */
async function uploadRekeyableBlob(
  storage: InMemoryStorage,
  dek: Uint8Array,
): Promise<`0x${string}`> {
  const plaintext = new TextEncoder().encode("custody-secret-v1");
  const blob = concatEncrypted(aesGcmEncrypt(dek, plaintext));
  const { rootHash } = await storage.upload(blob);
  storage.markDataHashSeen(rootHash as `0x${string}`);
  return rootHash as `0x${string}`;
}

const DATA_HASH = ("0x" + "aa".repeat(32)) as `0x${string}`;

describe("sealed-DEK custody (AXIOM_DEK_CUSTODY)", () => {
  let backend: Backend;
  let url: string;
  let receiverAddress: string;
  let receiverPubkey64: `0x${string}`;

  beforeAll(async () => {
    backend = start("true");
    const addr = backend.httpServer.address() as AddressInfo;
    url = `http://127.0.0.1:${addr.port}`;
    const receiver = new Wallet(RECEIVER_PRIV);
    receiverAddress = receiver.address;
    receiverPubkey64 = ("0x" +
      Buffer.from(deriveUncompressedPubkeyFromHex(RECEIVER_PRIV)).toString(
        "hex",
      )) as `0x${string}`;
  });

  afterAll(async () => {
    await waitForClose(backend.httpServer);
  });

  test("custody ON: mint-time upload persists the sealed DEK keyed by tokenId", async () => {
    const dek = new Uint8Array(randomBytes(32));
    const res = await uploadSealedDek(url, "501", dek);
    assert.equal(res.status, 200);
    const row = backend.custody!.lookup("501");
    assert.ok(row, "custody row must exist after mint upload");
    assert.ok(row.sealedDek.startsWith("0x"));
    assert.ok(row.uploadedAt > 0);
  });

  test("custody ON: transfer without sender DEK re-keys from custody and deletes the row", async () => {
    const dek = new Uint8Array(randomBytes(32));
    const oldDataUri = await uploadRekeyableBlob(backend.storage, dek);
    const up = await uploadSealedDek(url, "502", dek);
    assert.equal(up.status, 200);

    const { status, data } = await fetchJson<{
      ok: boolean;
      stage: string;
      rekeyed: boolean;
      rekeyedFromCustody?: boolean;
      newDataHash: string;
    }>(`${url}/v1/agents/502/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: receiverAddress,
        receiverPubKey64: receiverPubkey64,
        accessProofNonce: 3,
        // Senderless + custody: no oldDataUri, no sealedDataEncryptionKey —
        // the route falls back to the on-chain dataHash for the URI binding.
        dataHash: oldDataUri,
      }),
    });
    assert.equal(status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.stage, "challenge");
    assert.equal(data.rekeyed, true);
    assert.equal(data.rekeyedFromCustody, true);
    assert.ok(data.newDataHash);
    // Row burned on successful re-key (ADR-004 §2.4).
    assert.equal(
      backend.custody!.lookup("502"),
      undefined,
      "custody row must be deleted after successful re-key",
    );
  });

  test("custody ON: missing row → typed 400 telling the sender to provide the DEK", async () => {
    const oldDataUri = await uploadRekeyableBlob(
      backend.storage,
      new Uint8Array(randomBytes(32)),
    );
    const { status, data } = await fetchJson<{ error: string }>(
      `${url}/v1/agents/503/transfer`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: receiverAddress,
          receiverPubKey64: receiverPubkey64,
          accessProofNonce: 4,
          dataHash: oldDataUri,
        }),
      },
    );
    assert.equal(status, 400);
    assert.match(
      data.error,
      /no sealed data key on file|sealedDataEncryptionKey/i,
    );
  });

  test("custody ON: sender-supplied DEK still wins (BYOK) and row stays intact", async () => {
    const custodiedDek = new Uint8Array(randomBytes(32));
    const senderDek = new Uint8Array(randomBytes(32));
    const oldDataUri = await uploadRekeyableBlob(backend.storage, senderDek);
    const up = await uploadSealedDek(url, "504", custodiedDek);
    assert.equal(up.status, 200);

    const sealedDek = sealKeyForReceiver(
      oracleSigner.uncompressedPubkey,
      senderDek,
    );
    const { status, data } = await fetchJson<{
      ok: boolean;
      rekeyed: boolean;
      rekeyedFromCustody?: boolean;
    }>(`${url}/v1/agents/504/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: receiverAddress,
        receiverPubKey64: receiverPubkey64,
        accessProofNonce: 5,
        dataHash: oldDataUri,
        oldDataUri,
        sealedDataEncryptionKey: "0x" + Buffer.from(sealedDek).toString("hex"),
      }),
    });
    assert.equal(status, 200);
    assert.equal(data.rekeyed, true);
    assert.equal(data.rekeyedFromCustody, undefined);
    // BYOK re-key succeeds against the SENDER's key — a custody-supplied key
    // would have failed the GCM auth tag and 502'd. Row untouched (burn only
    // happens when the row itself was consumed).
    assert.ok(backend.custody!.lookup("504"), "BYOK must not burn the row");
  });
});

describe("sealed-DEK custody disabled (default)", () => {
  let backend: Backend;
  let url: string;
  let receiverAddress: string;
  let receiverPubkey64: `0x${string}`;

  beforeAll(async () => {
    backend = start(undefined);
    const addr = backend.httpServer.address() as AddressInfo;
    url = `http://127.0.0.1:${addr.port}`;
    const receiver = new Wallet(RECEIVER_PRIV);
    receiverAddress = receiver.address;
    receiverPubkey64 = ("0x" +
      Buffer.from(deriveUncompressedPubkeyFromHex(RECEIVER_PRIV)).toString(
        "hex",
      )) as `0x${string}`;
  });

  afterAll(async () => {
    await waitForClose(backend.httpServer);
  });

  test("custody OFF: mint-time upload is refused with a clear error", async () => {
    const dek = new Uint8Array(randomBytes(32));
    const { status, error } = await uploadSealedDek(url, "601", dek);
    assert.equal(status, 400);
    assert.match(error ?? "", /AXIOM_DEK_CUSTODY/i);
  });

  test("custody OFF: sender-provided path unchanged, custody lookup never happens", async () => {
    const dek = new Uint8Array(randomBytes(32));
    const oldDataUri = await uploadRekeyableBlob(backend.storage, dek);
    const sealedDek = sealKeyForReceiver(oracleSigner.uncompressedPubkey, dek);
    const { status, data } = await fetchJson<{
      ok: boolean;
      rekeyed: boolean;
      rekeyedFromCustody?: boolean;
    }>(`${url}/v1/agents/602/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: receiverAddress,
        receiverPubKey64: receiverPubkey64,
        accessProofNonce: 6,
        dataHash: oldDataUri,
        oldDataUri,
        sealedDataEncryptionKey: "0x" + Buffer.from(sealedDek).toString("hex"),
      }),
    });
    assert.equal(status, 200);
    assert.equal(data.rekeyed, true);
    assert.equal(data.rekeyedFromCustody, undefined);
  });

  test("custody OFF: senderless transfer falls back to the pre-custody behavior (no rekey, no custody error)", async () => {
    const { status, data } = await fetchJson<{
      error?: string;
      sealedKey?: string;
    }>(`${url}/v1/agents/603/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: receiverAddress,
        receiverPubKey64: receiverPubkey64,
        accessProofNonce: 7,
        dataHash: DATA_HASH,
      }),
    });
    // Without custody, a senderless challenge takes the zero-padded-sealedKey
    // devnet path (dev) or 400s in production — either way it never re-keys
    // from custody and never mentions a vault row.
    assert.notEqual(status, 500);
    if (data.error) {
      assert.doesNotMatch(data.error, /custody|on file/i);
    }
  });
});
