import { test } from "node:test";
import assert from "node:assert/strict";
import { ethers, FetchRequest } from "ethers";
import { ZeroGStorage, type Encryption } from "./0g.js";
import { resolveRpcUrl, GALILEO_CHAIN_ID } from "@axiom/config/networks";

// Note: these tests run against the REAL 0G Galileo testnet storage indexer.
// They require TEE_SIGNER_PK (or DEPLOYER_PK) env to be set. If the env is missing
// the tests skip themselves gracefully.

const DEPLOYER_PK = process.env.DEPLOYER_PK;
const INDEXER_RPC = process.env.OG_STORAGE_RPC ?? "https://indexer-storage-testnet-turbo.0g.ai";
const EVM_RPC = resolveRpcUrl(GALILEO_CHAIN_ID);
const fetchReq = new ethers.FetchRequest(EVM_RPC);
fetchReq.timeout = 10_000;
const provider = new ethers.JsonRpcProvider(fetchReq, GALILEO_CHAIN_ID, { staticNetwork: true });

if (!DEPLOYER_PK) {
  test("0G Storage roundtrip (skipped — no DEPLOYER_PK)", { skip: true }, () => {});
  test("0G Storage AES-256 roundtrip (skipped — no DEPLOYER_PK)", { skip: true }, () => {});
} else {
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
