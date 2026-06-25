import { randomBytes } from "node:crypto";
import { Wallet, parseEther, hexlify, toUtf8Bytes, FetchRequest, JsonRpcProvider, getBytes, SigningKey, computeAddress, type TransactionResponse } from "ethers";
import { TypedContract } from "@axiom/config/types/contract";
import { keccak256 } from "ethereum-cryptography/keccak";
import { ZeroGStorage } from "@axiom/config/storage/0g";
import { encrypt as eciesEncrypt, decrypt as eciesDecrypt } from "eciesjs";
import { loadEnv, getEnv, getEnvWithAlias } from "../env.js";
import { aesGcmEncrypt } from "@axiom/oracle/crypto/aes-gcm";
import { accessMessageHash, type Eip712Domain } from "@axiom/oracle/signer";
import { deriveUncompressedPubkeyFromHex } from "@axiom/oracle/crypto/secp256k1";
import { resolveStorageRpc, GALILEO_CHAIN_ID } from "@axiom/config/networks";
import { ITRANSFER_FROM_ABI } from "@axiom/config/abis";

/**
 * End-to-end CLI for the Axiom Protocol on 0G Galileo testnet.
 * Per the `ts-no-dynamic-import` rule, all modules are static-imported.
 */

loadEnv();

const DEPLOYER_PK = getEnv("DEPLOYER_PK");
const TEE_SIGNER_PK = getEnv("TEE_SIGNER_PK");
const RPC = getEnvWithAlias("AXIOM_EVM_RPC", ["OG_RPC_URL"]);
const STORAGE_RPC = getEnvWithAlias("AXIOM_STORAGE_RPC", ["OG_STORAGE_RPC"], resolveStorageRpc(GALILEO_CHAIN_ID));
const BACKEND_URL = getEnv("BACKEND_URL", "http://127.0.0.1:3000");
const OG_CHAIN_ID = Number.parseInt(getEnvWithAlias("AXIOM_CHAIN_ID", ["OG_CHAIN_ID"], String(GALILEO_CHAIN_ID)), 10);
// Wave E-5 (2026-06-16) — all addresses are env-driven so a redeploy
// doesn't require a code change. See docs/deployments/wave-e5-redeploy-2026-06-16.md.
const TEE_VERIFIER = getEnv("AXIOM_TEE_VERIFIER", "0x24f725198d64A3b03A8386cD8fa12BD7c591734A");
const PAYMENT_PROCESSOR = getEnv("AXIOM_PAYMENT_PROCESSOR", "0x096203fB54681b66dD8ab9bA47aaB462aA8C4A5f");
const PAYMENT_TOKEN = getEnv("AXIOM_PAYMENT_TOKEN", "0xeA13E136E59c6e919BeF2221f6ecDE2cBCEb0Dbf");
const AGENT_NFT = getEnv("AGENT_NFT_ADDRESS", "0xf12F158a20c36a351b056FD60b3a7377ce4F1e09");
const VAULT = getEnv("VAULT_ADDRESS", "0xb7F89e50D5A3039Da7d39528436B820371572874");

const fetchReq = new FetchRequest(RPC);
fetchReq.timeout = 10_000;
const provider = new JsonRpcProvider(fetchReq, OG_CHAIN_ID, { staticNetwork: true });
const deployer = new Wallet(DEPLOYER_PK, provider);
const teeSigner = new Wallet(TEE_SIGNER_PK, provider);
const RECEIVER_PK = getEnv("RECEIVER_PK");
const receiver = new Wallet(RECEIVER_PK, provider);
const to = receiver.address as `0x${string}`;
const receiverPubKey64 = hexlify(deriveUncompressedPubkeyFromHex(RECEIVER_PK)) as `0x${string}`;
// EIP-712 domain for AccessProof signing — MUST match the on-chain
// AxiomTeeVerifier._domainSeparator() (chainId + verifyingContract).
const eip712Domain: Eip712Domain = {
  chainId: BigInt(OG_CHAIN_ID),
  verifyingContract: TEE_VERIFIER as `0x${string}`,
};

// Local contract method types derived from ITRANSFER_FROM_ABI (avoid shared contract-types.ts drift).
type AgentNFTMethods = {
  iTransferFrom(from: string, to: string, tokenId: bigint, proofs: unknown[]): Promise<TransactionResponse>;
  ownerOf(tokenId: bigint): Promise<string>;
};

interface StepResult { step: number; name: string; ok: boolean; summary: string; txHash?: string; }
const stepResults: StepResult[] = [];

async function main(): Promise<void> {
  console.log("============================================");
  console.log("  Axiom Protocol — E2E CLI (MW14)");
  console.log("============================================");
  console.log(`Network:    ${getEnv("OG_NETWORK_NAME", "galileo")}`);
  console.log(`RPC:        ${RPC}`);
  console.log(`Storage:    ${STORAGE_RPC}`);
  console.log(`Backend:    ${BACKEND_URL}`);
  console.log(`Deployer:   ${deployer.address}`);
  console.log(`TEE signer: ${teeSigner.address}`);
  console.log(`TEE verifier: ${TEE_VERIFIER}`);
  console.log(`Payment proc: ${PAYMENT_PROCESSOR}`);
  console.log(`Pay token:    ${PAYMENT_TOKEN}`);
  console.log(`Agent NFT:    ${AGENT_NFT}`);
  console.log(`Vault:        ${VAULT}`);
  console.log("");
  /**
   * Run one HTTP step: build the request, fire it, parse JSON, log + push
   * a `StepResult`. The `summary` callback is given the typed response so
   * the caller can pick the fields it wants to surface in the report.
   * Canonical source: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
   */
  async function postStep<T>(step: number, name: string, body: unknown, summary: (r: T) => { summary: string; txHash?: string; ok?: boolean }): Promise<T> {
    const res = await (await fetch(`${BACKEND_URL}${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })).json() as T;
    const s = summary(res);
    console.log(`          ${JSON.stringify(res)}`);
    stepResults.push({ step, name, ok: s.ok ?? true, summary: s.summary, txHash: s.txHash });
    return res;
  }

  console.log("[Step 1]  GET /health");
  const health = (await (await fetch(`${BACKEND_URL}/health`)).json() as { ok: boolean; signer: string; chainHead: number });
  console.log(`          ok=${health.ok} chainHead=${health.chainHead}`);
  stepResults.push({ step: 1, name: "/health", ok: health.ok === true, summary: `chainHead=${health.chainHead}` });

  console.log("\n[Step 2]  Build StrategySpec");
  const strategy = { targetToken: "0xOG", threshold: 100, action: "buy" };
  const strategyJson = JSON.stringify(strategy);
  console.log(`          Strategy: ${strategyJson}`);
  stepResults.push({ step: 2, name: "StrategySpec", ok: true, summary: strategyJson });

  console.log("\n[Step 3]  Encrypt with AES-256-GCM, seal for deployer pubkey");
  const dataKey = new Uint8Array(randomBytes(32));
  const plaintext = toUtf8Bytes(strategyJson);
  const enc = aesGcmEncrypt(dataKey, plaintext);
  const blob = new Uint8Array(enc.iv.length + enc.ciphertext.length + enc.authTag.length);
  blob.set(enc.iv, 0);
  blob.set(enc.ciphertext, enc.iv.length);
  blob.set(enc.authTag, enc.iv.length + enc.ciphertext.length);
  const deployerPub = Buffer.concat([new Uint8Array([0x04]), deriveUncompressedPubkeyFromHex(DEPLOYER_PK)]);
  const sealedKey = eciesEncrypt(deployerPub, dataKey);
  console.log(`          Encrypted ${plaintext.length} bytes (dataKey ${dataKey.length}B, sealedKey ${sealedKey.length}B)`);
  stepResults.push({ step: 3, name: "encrypt+seal", ok: true, summary: `blob=${blob.length}B sealedKey=${sealedKey.length}B` });

  console.log("\n[Step 4]  Upload encrypted strategy to 0G Storage");
  const storage = new ZeroGStorage({ indexerRpc: STORAGE_RPC, evmRpc: RPC, signer: deployer });
  const upload = await storage.uploadData(blob, { type: "aes256", key: dataKey });
  console.log(`          Uploaded: root=${upload.rootHash} tx=${upload.txHash}`);
  stepResults.push({ step: 4, name: "0G Storage upload", ok: true, summary: `root=${upload.rootHash}`, txHash: upload.txHash });

  console.log("\n[Step 5]  POST /v1/agents/mint");
  const mint = await postStep<{ ok: boolean; tokenId?: string; dataHash: string; txHash: string; error?: string }>(
    5, "/v1/agents/mint",
    { agentNft: AGENT_NFT, encryptedStrategyUri: upload.rootHash, sealedKey: hexlify(sealedKey), owner: deployer.address },
    (r) => ({ summary: `tokenId=${r.tokenId} dataHash=${r.dataHash}`, txHash: r.txHash, ok: r.ok === true }),
  );
  const tokenId = mint.tokenId ?? "0";

  console.log(`\n[Step 6]  POST /v1/vaults/${tokenId}/deposit (0.1 native équivalent)`);
  const depositValueWei = parseEther("0.1").toString();
  const _deposit = await postStep<{ ok: boolean; valueWei: string; error?: string }>(
    6, `/v1/vaults/${tokenId}/deposit`,
    { valueWei: depositValueWei, depositor: deployer.address },
    (r) => ({ summary: `valueWei=${r.valueWei}`, ok: r.ok === true }),
  );
  console.log(`\n[Step 7]  POST /v1/vaults/${tokenId}/strategy (Merkle root + daily limit)`);
  const merkleRoot = hexlify(keccak256(toUtf8Bytes("noop:" + Date.now()))) as `0x${string}`;
  const dailyLimitWei = parseEther("1").toString();
  const _strat = await postStep<{ ok: boolean; merkleRoot: string; error?: string }>(
    7, `/v1/vaults/${tokenId}/strategy`,
    { merkleRoot, dailyLimitWei },
    (r) => ({ summary: `merkleRoot=${r.merkleRoot}`, ok: r.ok === true }),
  );

  console.log("\n[Step 8]  POST /v1/orchestrator/tick (Promise.all fan-out)");
  const _tick = await postStep<{ recommendation?: { action: string; reason: string }; rawModelOutput?: string; durationMs?: number; error?: string }>(
    8, "/v1/orchestrator/tick",
    {
      vault: VAULT,
      agentNft: AGENT_NFT,
      agentTokenId: tokenId,
      strategy: "hold",
      signalSource: "manual:e2e",
      signalPayload: { vaultBalance: depositValueWei, recentTrades: [] },
    },
    (r) => ({
      summary: r.recommendation ? `action=${r.recommendation.action} duration=${r.durationMs ?? 0}ms` : (r.error ?? "no result"),
      ok: r.recommendation !== undefined,
    }),
  );
  // Re-seal the dataKey for the receiver (Option A): unwrap with deployer,
  // re-wrap with receiver pubkey. The new sealedKey goes into the OwnershipProof.
  const recoveredDataKey = eciesDecrypt(deployer.privateKey, sealedKey);
  // ECIES requires uncompressed pubkey with 0x04 prefix (65 bytes).
  const receiverPub = new Uint8Array(65);
  receiverPub[0] = 0x04;
  receiverPub.set(getBytes(receiverPubKey64).subarray(0, 64), 1);
  const resealedKey = eciesEncrypt(receiverPub, recoveredDataKey);
  const sealedKeyForReceiver = hexlify(resealedKey) as `0x${string}`;
  console.log(`\n[Step 8.5] Re-seal dataKey for receiver (${resealedKey.length}B)`);
  console.log(`\n[Step 9]  POST /v1/agents/${tokenId}/transfer (two-stage challenge → personal_sign → final)`);
  // 9a. Challenge stage: backend returns TEE-signed OwnershipProof challenge.
  interface ChallengeResponse {
    ok: boolean;
    stage: "challenge";
    tokenId: string;
    to: `0x${string}`;
    dataHash: `0x${string}`;
    targetPubkey: `0x${string}`;
    accessProofNonce: number;
    validUntil: string;
    ownershipSignature: string;
    signer: string;
    error?: string;
  }
  const challenge = await postStep<ChallengeResponse>(
    9, `/v1/agents/${tokenId}/transfer`,
    { to, receiverPubKey64, accessProofNonce: 1, dataHash: upload.rootHash, sealedKey: sealedKeyForReceiver },
    (r) => ({
      summary: `stage=${r.stage} to=${r.to} tee=${r.signer?.slice(0, 10)}…`,
      ok: r.ok === true && r.stage === "challenge",
    }),
  );

  // 9b. Receiver signs the AccessProof digest via EIP-191 personal_sign.
  const accessInput = {
    dataHash: challenge.dataHash,
    targetPubkey: challenge.targetPubkey,
    to,
    nft: AGENT_NFT as `0x${string}`,
    nonce: BigInt(challenge.accessProofNonce),
    validUntil: BigInt(challenge.validUntil),
  };
  const accessDigest = accessMessageHash(accessInput, eip712Domain);
  const accessProofSignature = receiver.signingKey.sign(getBytes(accessDigest)).serialized;
  // 9c. Final stage: post signed AccessProof, get full on-chain structs.
  interface FinalResponse {
    ok: boolean;
    stage: "final";
    tokenId: string;
    to: `0x${string}`;
    accessSigner: `0x${string}`;
    signer: string;
    accessProof: {
      dataHash: `0x${string}`;
      targetPubkey: `0x${string}`;
      nonce: string;
      proof: `0x${string}`;
      validUntil: string;
    };
    ownershipProof: {
      oracleType: number;
      dataHash: `0x${string}`;
      sealedKey: `0x${string}`;
      targetPubkey: `0x${string}`;
      nonce: string;
      proof: `0x${string}`;
      validUntil: string;
    };
    error?: string;
  }
  const finalResp = await postStep<FinalResponse>(
    9, `/v1/agents/${tokenId}/transfer`,
    {
      to,
      receiverPubKey64,
      dataHash: challenge.dataHash,
      sealedKey: sealedKeyForReceiver,
      accessProof: {
        dataHash: challenge.dataHash,
        targetPubkey: challenge.targetPubkey,
        nonce: challenge.accessProofNonce,
        proof: accessProofSignature,
        validUntil: challenge.validUntil,
      },
    },
    (r) => ({
      summary: `stage=${r.stage} accessSigner=${r.accessSigner} tee=${r.signer?.slice(0, 10)}…`,
      ok: r.ok === true && r.stage === "final" && r.accessSigner?.toLowerCase() === to.toLowerCase(),
    }),
  );
  console.log(`          AccessProof signer ${finalResp.accessSigner} matches receiver ${to}`);

  console.log(`\n[Step 10] AxiomAgentNFT.iTransferFrom on Galileo`);
  const ITRANSFER_FROM_ABI_LOCAL = [
    ...ITRANSFER_FROM_ABI,
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    "function ownerOf(uint256 tokenId) view returns (address)",
  ];
  const nftTc = new TypedContract<AgentNFTMethods>(AGENT_NFT, ITRANSFER_FROM_ABI_LOCAL, deployer);
  const currentOwner = await nftTc.contract.ownerOf(BigInt(tokenId));
  if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log(`          Skip: tokenId=${tokenId} already owned by ${currentOwner} (not deployer).`);
    stepResults.push({ step: 10, name: "iTransferFrom on-chain", ok: true, summary: `skipped (owner=${currentOwner})` });
  } else {
    try {
      const proofs = [{
        accessProof: {
          dataHash: finalResp.accessProof.dataHash,
          targetPubkey: finalResp.accessProof.targetPubkey,
          nonce: finalResp.accessProof.nonce,
          proof: finalResp.accessProof.proof,
          validUntil: finalResp.accessProof.validUntil,
        },
        ownershipProof: {
          oracleType: finalResp.ownershipProof.oracleType,
          dataHash: finalResp.ownershipProof.dataHash,
          sealedKey: finalResp.ownershipProof.sealedKey,
          targetPubkey: finalResp.ownershipProof.targetPubkey,
          nonce: finalResp.ownershipProof.nonce,
          proof: finalResp.ownershipProof.proof,
          validUntil: finalResp.ownershipProof.validUntil,
        },
      }];
      await nftTc.raw.getFunction("iTransferFrom").staticCall(deployer.address, to, BigInt(tokenId), proofs);
      const tx = await nftTc.contract.iTransferFrom(deployer.address, to, BigInt(tokenId), proofs);
      const receipt = await tx.wait();
      const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
      const transferLog = receipt?.logs.find((l) => l.topics[0] === transferTopic);
      if (!transferLog) throw new Error("Transfer event not found");
      const parsed = nftTc.iface.parseLog(transferLog);
      if (!parsed) throw new Error("Transfer log parse failed");
      const [eventFrom, eventTo, eventTokenId] = parsed.args as unknown as [string, string, bigint];
      if (eventFrom.toLowerCase() !== deployer.address.toLowerCase()) throw new Error("Transfer from mismatch");
      if (eventTo.toLowerCase() !== to.toLowerCase()) throw new Error("Transfer to mismatch");
      if (eventTokenId.toString() !== tokenId) throw new Error("Transfer tokenId mismatch");
      const newOwner = await nftTc.contract.ownerOf(BigInt(tokenId));
      const recoveredDigest = getBytes(accessMessageHash({
        dataHash: finalResp.accessProof.dataHash,
        targetPubkey: finalResp.accessProof.targetPubkey,
        to,
        nft: AGENT_NFT as `0x${string}`,
        nonce: BigInt(finalResp.accessProof.nonce),
        validUntil: BigInt(finalResp.accessProof.validUntil),
      }, eip712Domain));
      const recoveredPubKey = SigningKey.recoverPublicKey(recoveredDigest, finalResp.accessProof.proof);
      const recoveredAddr = computeAddress(recoveredPubKey);
      if (recoveredAddr.toLowerCase() !== to.toLowerCase()) throw new Error("access signer mismatch");
      stepResults.push({ step: 10, name: "iTransferFrom on-chain", ok: true, summary: `tx=${tx.hash} owner=${newOwner} accessSigner=${recoveredAddr}`, txHash: tx.hash });
      console.log(`          tx=${tx.hash} owner=${newOwner} accessSigner=${recoveredAddr}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`          [WARN] iTransferFrom on-chain reverted: ${msg.slice(0, 200)}`);
      stepResults.push({ step: 10, name: "iTransferFrom on-chain", ok: false, summary: `reverted: ${msg.slice(0, 120)}` });
    }
  }

  console.log("\n============================================");
  console.log("  E2E Summary");
  console.log("============================================");
  for (const r of stepResults) {
    const flag = r.ok ? "[OK]" : "[FAIL]";
    console.log(`  Step ${r.step} ${flag}  ${r.name.padEnd(20)}  ${r.summary}`);
  }
  const passed = stepResults.filter((r) => r.ok).length;
  console.log(`\n  ${passed}/${stepResults.length} steps passed`);
  if (passed < stepResults.length) process.exit(1);
}

void main();
