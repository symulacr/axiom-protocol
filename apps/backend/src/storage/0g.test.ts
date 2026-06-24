import { test } from "node:test";
import assert from "node:assert/strict";
import { ZeroGStorage, type Encryption } from "./0g.js";

// Note: these tests run against the REAL 0G Galileo testnet storage indexer.
// They require TEE_SIGNER_PK (or DEPLOYER_PK) env to be set. If the env is missing
// the tests skip themselves gracefully.

const DEPLOYER_PK = process.env.DEPLOYER_PK;
const INDEXER_RPC = process.env.OG_STORAGE_RPC ?? "https://indexer-storage-testnet-turbo.0g.ai";
const EVM_RPC = process.env.OG_RPC_URL ?? "https://0g-galileo-testnet.drpc.org";

if (!DEPLOYER_PK) {
  test("0G Storage roundtrip (skipped — no DEPLOYER_PK)", { skip: true }, () => {});
  test("0G Storage AES-256 roundtrip (skipped — no DEPLOYER_PK)", { skip: true }, () => {});
} else {
  const { ethers } = await import("ethers");
  const provider = new ethers.JsonRpcProvider(EVM_RPC);
  const signer = new ethers.Wallet(DEPLOYER_PK, provider);
  const storage = new ZeroGStorage({
    indexerRpc: INDEXER_RPC,
    evmRpc: EVM_RPC,
    signer,
  });

  test("0G Storage unencrypted roundtrip", async () => {
    const payload = new TextEncoder().encode("Axiom agent model payload v1");
    const { rootHash, txHash, size } = await storage.uploadData(payload);
    console.log(`[storage] uploaded ${size} bytes → root=${rootHash} tx=${txHash}`);
    const { data, size: dlSize } = await storage.download(rootHash, { withProof: true });
    assert.equal(dlSize, payload.length, "downloaded size matches uploaded size");
    assert.equal(new TextDecoder().decode(data), "Axiom agent model payload v1", "downloaded content matches");
  });

  test("0G Storage AES-256 client-side encrypted roundtrip", async () => {
    const aesKey = new Uint8Array(32);
    for (let i = 0; i < 32; i++) aesKey[i] = i ^ 0xa5; // deterministic test key
    const payload = new TextEncoder().encode("Secret agent intelligence — encrypted at rest");
    const enc: Encryption = { type: "aes256", key: aesKey };
    const { rootHash, txHash, size } = await storage.uploadData(payload, enc);
    console.log(`[storage] uploaded (encrypted) ${size} bytes → root=${rootHash} tx=${txHash}`);
    const { data, size: dlSize } = await storage.download(rootHash, { symmetricKey: aesKey, withProof: true });
    assert.equal(dlSize, payload.length);
    assert.equal(new TextDecoder().decode(data), "Secret agent intelligence — encrypted at rest");
  });
}
