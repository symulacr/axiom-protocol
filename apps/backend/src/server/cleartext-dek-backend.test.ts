/**
 * Backend must reject cleartext DEK on transfer re-key (not only oracle).
 */
import { test } from "bun:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Wallet } from "ethers";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.AXIOM_DISABLE_AUTH = "true";
// Parallel bun test workers share no env; give this file its own EventStore
// data dir so on-disk event-store.lock never contends with sibling workers.
process.env.AXIOM_DATA_DIR = join(tmpdir(), `axiom-be-${process.pid}`);

import { startServer as startBackendServer } from "../server.js";
import { fetchJson } from "../utils/response.js";

function waitForListening(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", reject);
  });
}

test("POST transfer rejects cleartext oldDataEncryptionKey with 400", async () => {
  const signer = new Wallet("0x" + "33".repeat(32));
  const { httpServer } = startBackendServer({
    bind: "127.0.0.1",
    port: 0,
    evmRpc: "http://127.0.0.1:1",
    signer,
    oracleBaseUrl: "http://127.0.0.1:9",
    addresses: {
      agentNft: ("0x" + "00".repeat(19) + "01") as `0x${string}`,
      vault: ("0x" + "00".repeat(19) + "02") as `0x${string}`,
      verifier: ("0x" + "00".repeat(19) + "03") as `0x${string}`,
    },
    env: {
      AXIOM_TEE_SIGNER_PK: "0x" + "11".repeat(32),
    } as never,
  });
  await waitForListening(httpServer);
  const port = (httpServer.address() as AddressInfo).port;
  try {
    const { status, data } = await fetchJson<{
      error?: string;
      code?: string;
    }>(`http://127.0.0.1:${port}/v1/agents/1/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: signer.address,
        receiverPubKey64: "0x" + "ab".repeat(64),
        accessProofNonce: 1,
        dataHash: "0x" + "aa".repeat(32),
        oldDataUri: "0x" + "aa".repeat(32),
        oldDataEncryptionKey: Buffer.alloc(32, 7).toString("base64"),
      }),
    });
    assert.equal(status, 400);
    assert.match(
      String(data.error ?? data.code ?? ""),
      /cleartext|CLEARTEXT|sealedDataEncryptionKey/i,
    );
  } finally {
    await new Promise<void>((r) => httpServer.close(() => r()));
  }
});
