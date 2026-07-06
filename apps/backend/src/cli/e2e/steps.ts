import { randomBytes } from "node:crypto";
import {
  Wallet,
  hexlify,
  getBytes,
  type TransactionResponse,
} from "ethers";
import { TypedContract } from "@axiom/config/types/contract";
import { ZeroGStorage } from "@axiom/config/storage/0g";
import { encrypt as eciesEncrypt, decrypt as eciesDecrypt } from "eciesjs";
import {
  aesGcmEncrypt,
  accessMessageHash,
  deriveUncompressedPubkeyFromHex,
  recoverAccessSigner,
  type Eip712Domain,
} from "@axiom/config";
import { ITRANSFER_FROM_ABI } from "@axiom/config/abis";
import { TRANSFER_TOPIC } from "../../utils/constants.js";
import type { fetchJson as fetchJsonFn } from "../../utils/fetch-json.js";
import { postStep as postStepFn, stepResults } from "./http.js";

type FetchJson = typeof fetchJsonFn;
type PostStep = typeof postStepFn;

export interface E2eBannerDeps {
  networkName: string;
  rpc: string;
  storageRpc: string;
  backendUrl: string;
  deployerAddress: string;
  teeSignerAddress: string;
  teeVerifier: string;
  paymentProcessor: string;
  paymentToken: string;
  agentNft: string;
  vault: string;
}

export function printE2eBanner(deps: E2eBannerDeps): void {
  console.log("============================================");
  console.log("  Axiom Protocol — E2E CLI (MW14)");
  console.log("============================================");
  console.log(`Network:    ${deps.networkName}`);
  console.log(`RPC:        ${deps.rpc}`);
  console.log(`Storage:    ${deps.storageRpc}`);
  console.log(`Backend:    ${deps.backendUrl}`);
  console.log(`Deployer:   ${deps.deployerAddress}`);
  console.log(`TEE signer: ${deps.teeSignerAddress}`);
  console.log(`TEE verifier: ${deps.teeVerifier}`);
  console.log(`Payment proc: ${deps.paymentProcessor}`);
  console.log(`Pay token:    ${deps.paymentToken}`);
  console.log(`Agent NFT:    ${deps.agentNft}`);
  console.log(`Vault:        ${deps.vault}`);
  console.log("");
}

export async function runHealthStep(
  backendUrl: string,
  fetchJson: FetchJson,
): Promise<void> {
  console.log("[Step 1]  GET /health");
  const { data: health } = await fetchJson<{
    ok: boolean;
    signer: string;
    chainHead: number;
  }>(`${backendUrl}/health`);
  console.log(`          ok=${health.ok} chainHead=${health.chainHead}`);
  stepResults.push({
    step: 1,
    name: "/health",
    ok: health.ok === true,
    summary: `chainHead=${health.chainHead}`,
  });
}

export function runStrategyStep(): string {
  console.log("\n[Step 2]  Build StrategySpec");
  const strategy = { targetToken: "0xOG", threshold: 100, action: "buy" };
  const strategyJson = JSON.stringify(strategy);
  console.log(`          Strategy: ${strategyJson}`);
  stepResults.push({
    step: 2,
    name: "StrategySpec",
    ok: true,
    summary: strategyJson,
  });
  return strategyJson;
}

export interface EncryptStepResult {
  blob: Uint8Array;
  sealedKey: Uint8Array;
}

export function runEncryptStep(
  deployerPk: string,
  strategyJson: string,
): EncryptStepResult {
  console.log("\n[Step 3]  Encrypt with AES-256-GCM, seal for deployer pubkey");
  const dataKey = new Uint8Array(randomBytes(32));
  const plaintext = Buffer.from(strategyJson, "utf-8");
  const enc = aesGcmEncrypt(dataKey, plaintext);
  const blob = new Uint8Array(
    enc.iv.length + enc.ciphertext.length + enc.authTag.length,
  );
  blob.set(enc.iv, 0);
  blob.set(enc.ciphertext, enc.iv.length);
  blob.set(enc.authTag, enc.iv.length + enc.ciphertext.length);
  const deployerPub = Buffer.concat([
    new Uint8Array([0x04]),
    deriveUncompressedPubkeyFromHex(deployerPk),
  ]);
  const sealedKey = eciesEncrypt(deployerPub, dataKey);
  console.log(
    `          Encrypted ${plaintext.length} bytes (dataKey ${dataKey.length}B, sealedKey ${sealedKey.length}B)`,
  );
  stepResults.push({
    step: 3,
    name: "encrypt+seal",
    ok: true,
    summary: `blob=${blob.length}B sealedKey=${sealedKey.length}B`,
  });
  return { blob, sealedKey };
}

export interface UploadStepResult {
  rootHash: `0x${string}`;
  txHash: string;
}

export async function runUploadStep(deps: {
  storageRpc: string;
  rpc: string;
  signer: Wallet;
  blob: Uint8Array;
}): Promise<UploadStepResult> {
  console.log("\n[Step 4]  Upload encrypted strategy to 0G Storage");
  const storage = new ZeroGStorage({
    indexerRpc: deps.storageRpc,
    evmRpc: deps.rpc,
    signer: deps.signer,
  });
  const upload = await storage.uploadData(deps.blob);
  console.log(
    `          Uploaded: root=${upload.rootHash} tx=${upload.txHash}`,
  );
  stepResults.push({
    step: 4,
    name: "0G Storage upload",
    ok: true,
    summary: `root=${upload.rootHash}`,
    txHash: upload.txHash,
  });
  return { rootHash: upload.rootHash, txHash: upload.txHash };
}

export async function runMintStep(
  oracleUrl: string,
  dataHash: `0x${string}`,
  fetchJson: FetchJson,
): Promise<void> {
  console.log(
    "\n[Step 5]  Register dataHash with oracle (POST /v1/agents/mint)",
  );
  const { data: mint } = await fetchJson<{
    ok: boolean;
    dataHash: string;
    seen: boolean;
  }>(`${oracleUrl}/v1/agents/mint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataHash }),
  });
  console.log(`          ok=${mint.ok} dataHash=${mint.dataHash}`);
  stepResults.push({
    step: 5,
    name: "oracle /v1/agents/mint",
    ok: mint.ok === true,
    summary: `dataHash=${mint.dataHash}`,
  });
}

export function runSkippedVaultSteps(): void {
  console.log(
    `\n[Step 6]  (skipped — vault deposit is a wallet-owned on-chain operation, not a backend route)`,
  );
  stepResults.push({
    step: 6,
    name: "/v1/vaults/deposit",
    ok: true,
    summary: "skipped (wallet-owned operation)",
  });
  console.log(
    `\n[Step 7]  (skipped — vault strategy is a wallet-owned on-chain operation, not a backend route)`,
  );
  stepResults.push({
    step: 7,
    name: "/v1/vaults/strategy",
    ok: true,
    summary: "skipped (wallet-owned operation)",
  });
}

export async function runTickStep(deps: {
  backendUrl: string;
  postStep: PostStep;
  vault: string;
  agentNft: string;
  tokenId: string;
}): Promise<void> {
  console.log("\n[Step 8]  POST /v1/orchestrator/tick (Promise.all fan-out)");
  await deps.postStep<{
    recommendation?: { action: string; reason: string };
    rawModelOutput?: string;
    durationMs?: number;
    error?: string;
  }>(
    deps.backendUrl,
    8,
    "/v1/orchestrator/tick",
    {
      vault: deps.vault,
      agentNft: deps.agentNft,
      agentTokenId: deps.tokenId,
      strategy: "hold",
      signalSource: "manual:e2e",
      signalPayload: { vaultBalance: "0", recentTrades: [] },
    },
    (r) => ({
      summary: r.recommendation
        ? `action=${r.recommendation.action} duration=${r.durationMs ?? 0}ms`
        : (r.error ?? "no result"),
      ok: r.recommendation !== undefined,
    }),
  );
}

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

export type TransferStepResult = FinalResponse;

export async function runTransferSteps(deps: {
  backendUrl: string;
  postStep: PostStep;
  deployer: Wallet;
  receiver: Wallet;
  receiverPubKey64: `0x${string}`;
  to: `0x${string}`;
  tokenId: string;
  dataHash: `0x${string}`;
  sealedKey: Uint8Array;
  agentNft: string;
  eip712Domain: Eip712Domain;
}): Promise<TransferStepResult> {
  const recoveredDataKey = eciesDecrypt(deps.deployer.privateKey, deps.sealedKey);
  const receiverPub = new Uint8Array(65);
  receiverPub[0] = 0x04;
  receiverPub.set(getBytes(deps.receiverPubKey64).subarray(0, 64), 1);
  const resealedKey = eciesEncrypt(receiverPub, recoveredDataKey);
  const sealedKeyForReceiver = hexlify(resealedKey) as `0x${string}`;
  console.log(
    `\n[Step 8.5] Re-seal dataKey for receiver (${resealedKey.length}B)`,
  );
  console.log(
    `\n[Step 9]  POST /v1/agents/${deps.tokenId}/transfer (two-stage challenge → personal_sign → final)`,
  );
  const challenge = await deps.postStep<ChallengeResponse>(
    deps.backendUrl,
    9,
    `/v1/agents/${deps.tokenId}/transfer`,
    {
      to: deps.to,
      receiverPubKey64: deps.receiverPubKey64,
      accessProofNonce: 1,
      dataHash: deps.dataHash,
      sealedKey: sealedKeyForReceiver,
    },
    (r) => ({
      summary: `stage=${r.stage} to=${r.to} tee=${r.signer?.slice(0, 10)}…`,
      ok: r.ok === true && r.stage === "challenge",
    }),
  );

  const accessInput = {
    dataHash: challenge.dataHash,
    targetPubkey: challenge.targetPubkey,
    to: deps.to,
    nft: deps.agentNft as `0x${string}`,
    nonce: BigInt(challenge.accessProofNonce),
    validUntil: BigInt(challenge.validUntil),
  };
  const accessDigest = accessMessageHash(accessInput, deps.eip712Domain);
  const accessProofSignature = deps.receiver.signingKey.sign(
    getBytes(accessDigest),
  ).serialized;

  const finalResp = await deps.postStep<FinalResponse>(
    deps.backendUrl,
    9,
    `/v1/agents/${deps.tokenId}/transfer`,
    {
      to: deps.to,
      receiverPubKey64: deps.receiverPubKey64,
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
      ok:
        r.ok === true &&
        r.stage === "final" &&
        r.accessSigner?.toLowerCase() === deps.to.toLowerCase(),
    }),
  );
  console.log(
    `          AccessProof signer ${finalResp.accessSigner} matches receiver ${deps.to}`,
  );
  return finalResp;
}

type AgentNFTMethods = {
  iTransferFrom(
    from: string,
    to: string,
    tokenId: bigint,
    proofs: unknown[],
  ): Promise<TransactionResponse>;
  ownerOf(tokenId: bigint): Promise<string>;
};

export async function runOnChainTransferStep(deps: {
  agentNft: string;
  deployer: Wallet;
  to: `0x${string}`;
  tokenId: string;
  finalResp: FinalResponse;
  eip712Domain: Eip712Domain;
}): Promise<void> {
  console.log(`\n[Step 10] AxiomAgentNFT.iTransferFrom on Galileo`);
  const ITRANSFER_FROM_ABI_LOCAL = [
    ...ITRANSFER_FROM_ABI,
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    "function ownerOf(uint256 tokenId) view returns (address)",
  ] as unknown as readonly string[];
  const nftTc = new TypedContract<AgentNFTMethods>(
    deps.agentNft,
    ITRANSFER_FROM_ABI_LOCAL,
    deps.deployer,
  );
  const currentOwner = await nftTc.contract.ownerOf(BigInt(deps.tokenId));
  if (currentOwner.toLowerCase() !== deps.deployer.address.toLowerCase()) {
    console.log(
      `          Skip: tokenId=${deps.tokenId} already owned by ${currentOwner} (not deployer).`,
    );
    stepResults.push({
      step: 10,
      name: "iTransferFrom on-chain",
      ok: true,
      summary: `skipped (owner=${currentOwner})`,
    });
  } else {
    try {
      const proofs = [
        {
          accessProof: {
            dataHash: deps.finalResp.accessProof.dataHash,
            targetPubkey: deps.finalResp.accessProof.targetPubkey,
            nonce: deps.finalResp.accessProof.nonce,
            proof: deps.finalResp.accessProof.proof,
            validUntil: deps.finalResp.accessProof.validUntil,
          },
          ownershipProof: {
            oracleType: deps.finalResp.ownershipProof.oracleType,
            dataHash: deps.finalResp.ownershipProof.dataHash,
            sealedKey: deps.finalResp.ownershipProof.sealedKey,
            targetPubkey: deps.finalResp.ownershipProof.targetPubkey,
            nonce: deps.finalResp.ownershipProof.nonce,
            proof: deps.finalResp.ownershipProof.proof,
            validUntil: deps.finalResp.ownershipProof.validUntil,
          },
        },
      ];
      await nftTc.raw
        .getFunction("iTransferFrom")
        .staticCall(deps.deployer.address, deps.to, BigInt(deps.tokenId), proofs);
      const tx = await nftTc.contract.iTransferFrom(
        deps.deployer.address,
        deps.to,
        BigInt(deps.tokenId),
        proofs,
      );
      const receipt = await tx.wait();
      const transferLog = receipt?.logs.find(
        (l) => l.topics[0] === TRANSFER_TOPIC,
      );
      if (!transferLog) throw new Error("Transfer event not found");
      const parsed = nftTc.iface.parseLog(transferLog);
      if (!parsed) throw new Error("Transfer log parse failed");
      const [eventFrom, eventTo, eventTokenId] = parsed.args as unknown as [
        string,
        string,
        bigint,
      ];
      if (eventFrom.toLowerCase() !== deps.deployer.address.toLowerCase())
        throw new Error("Transfer from mismatch");
      if (eventTo.toLowerCase() !== deps.to.toLowerCase())
        throw new Error("Transfer to mismatch");
      if (eventTokenId.toString() !== deps.tokenId)
        throw new Error("Transfer tokenId mismatch");
      const newOwner = await nftTc.contract.ownerOf(BigInt(deps.tokenId));
      const accessInput = {
        dataHash: deps.finalResp.accessProof.dataHash,
        targetPubkey: deps.finalResp.accessProof.targetPubkey,
        to: deps.to,
        nft: deps.agentNft as `0x${string}`,
        nonce: BigInt(deps.finalResp.accessProof.nonce),
        validUntil: BigInt(deps.finalResp.accessProof.validUntil),
      };
      const recoveredAddr = recoverAccessSigner(
        deps.finalResp.accessProof.proof,
        accessInput,
        deps.eip712Domain,
      );
      if (recoveredAddr.toLowerCase() !== deps.to.toLowerCase())
        throw new Error("access signer mismatch");
      stepResults.push({
        step: 10,
        name: "iTransferFrom on-chain",
        ok: true,
        summary: `tx=${tx.hash} owner=${newOwner} accessSigner=${recoveredAddr}`,
        txHash: tx.hash,
      });
      console.log(
        `          tx=${tx.hash} owner=${newOwner} accessSigner=${recoveredAddr}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(
        `          [WARN] iTransferFrom on-chain reverted: ${msg.slice(0, 200)}`,
      );
      stepResults.push({
        step: 10,
        name: "iTransferFrom on-chain",
        ok: false,
        summary: `reverted: ${msg.slice(0, 120)}`,
      });
    }
  }
}

export function printReport(): void {
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