import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  Wallet,
  hexlify,
  getBytes,
  parseEther,
  parseUnits,
  type Provider,
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
import {
  AGENT_NFT_ABI,
  ERC20_ABI,
  ITRANSFER_FROM_ABI,
  PAYMENT_PROCESSOR_ABI,
  VAULT_ABI,
} from "@axiom/config/abis";
import { TRANSFER_TOPIC } from "../../utils/constants.js";
import type { fetchJson as fetchJsonFn } from "../../utils/fetch-json.js";
import { postStep as postStepFn, stepResults } from "./http.js";
import {
  addressExplorerUrl,
  assertContractDeployed,
  assertReceiptOk,
  recordOnChainStep,
} from "./onchain.js";
import { assertParityGate, markCovered, printParityMatrix } from "./matrix.js";

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

export async function runContractsLiveStep(deps: {
  provider: Provider;
  chainId: number;
  agentNft: string;
  vault: string;
  teeVerifier: string;
  paymentProcessor: string;
  paymentToken: string;
}): Promise<void> {
  console.log("\n[Step 1b] Verify deployed contracts have bytecode on-chain");
  const checks: Array<{ address: string; label: string }> = [
    { address: deps.agentNft, label: "AxiomAgentNFT" },
    { address: deps.vault, label: "AxiomStrategyVault" },
    { address: deps.teeVerifier, label: "AxiomTeeVerifier" },
    { address: deps.paymentProcessor, label: "AxiomPaymentProcessor" },
    { address: deps.paymentToken, label: "PaymentToken" },
  ];
  for (const { address, label } of checks) {
    await assertContractDeployed(deps.provider, address, label);
    console.log(
      `          ${label} live at ${address} (${addressExplorerUrl(deps.chainId, address)})`,
    );
  }
  stepResults.push({
    step: 1,
    name: "on-chain bytecode",
    ok: true,
    summary: `${checks.length} contracts verified`,
  });
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
  chainId: number;
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
  recordOnChainStep({
    step: 4,
    name: "0G Storage upload",
    ok: true,
    summary: `root=${upload.rootHash}`,
    txHash: upload.txHash,
    chainId: deps.chainId,
  });
  return { rootHash: upload.rootHash, txHash: upload.txHash };
}

export async function runStorageVerifyStep(deps: {
  storageRpc: string;
  rpc: string;
  signer: Wallet;
  rootHash: `0x${string}`;
  expectedBlob: Uint8Array;
}): Promise<void> {
  console.log("\n[Step 4b] Download from 0G Storage with Merkle proof");
  const storage = new ZeroGStorage({
    indexerRpc: deps.storageRpc,
    evmRpc: deps.rpc,
    signer: deps.signer,
  });
  const downloaded = await storage.downloadWithOpts(deps.rootHash, {
    withProof: true,
  });
  if (downloaded.rootHash.toLowerCase() !== deps.rootHash.toLowerCase()) {
    throw new Error(
      `Storage root mismatch: expected ${deps.rootHash} got ${downloaded.rootHash}`,
    );
  }
  if (
    downloaded.data.length !== deps.expectedBlob.length ||
    !timingSafeEqual(downloaded.data, deps.expectedBlob)
  ) {
    throw new Error("Downloaded bytes do not match uploaded ciphertext");
  }
  stepResults.push({
    step: 4,
    name: "0G Storage verify",
    ok: true,
    summary: `merkle ok size=${downloaded.size}B root=${downloaded.rootHash}`,
  });
}

export async function runOracleRegisterStep(
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
  const ok =
    mint.ok === true && mint.dataHash.toLowerCase() === dataHash.toLowerCase();
  console.log(`          ok=${mint.ok} dataHash=${mint.dataHash} seen=${mint.seen}`);
  stepResults.push({
    step: 5,
    name: "oracle /v1/agents/mint",
    ok,
    summary: `dataHash=${mint.dataHash}`,
  });
  if (!ok) throw new Error("Oracle did not accept dataHash registration");
}

export interface OnChainMintResult {
  tokenId: bigint;
  txHash: string;
  blockNumber: number;
}

type AgentNftMintMethods = {
  mint(
    iDatas: Array<{ dataDescription: string; dataHash: string }>,
    to: string,
    overrides?: { value?: bigint },
  ): Promise<TransactionResponse>;
  mintFee(): Promise<bigint>;
  ownerOf(tokenId: bigint): Promise<string>;
  creatorOf(tokenId: bigint): Promise<string>;
  intelligentDatasOf(
    tokenId: bigint,
  ): Promise<Array<{ dataDescription: string; dataHash: string }>>;
};

export async function runOnChainMintStep(deps: {
  agentNft: string;
  deployer: Wallet;
  dataHash: `0x${string}`;
  chainId: number;
}): Promise<OnChainMintResult> {
  console.log("\n[Step 6]  Mint iNFT on-chain (AxiomAgentNFT.mint)");
  const nftTc = new TypedContract<AgentNftMintMethods>(
    deps.agentNft,
    AGENT_NFT_ABI,
    deps.deployer,
  );
  const mintFee = await nftTc.contract.mintFee();
  const tx = await nftTc.contract.mint(
    [{ dataDescription: "strategy", dataHash: deps.dataHash }],
    deps.deployer.address,
    { value: mintFee },
  );
  const receipt = assertReceiptOk(await tx.wait(), "mint");
  const transferLog = receipt.logs.find((l) => l.topics[0] === TRANSFER_TOPIC);
  if (!transferLog) throw new Error("mint: Transfer event not found");
  const parsed = nftTc.iface.parseLog(transferLog);
  if (!parsed) throw new Error("mint: failed to parse Transfer log");
  const tokenId = parsed.args[2] as bigint;
  const owner = await nftTc.contract.ownerOf(tokenId);
  const creator = await nftTc.contract.creatorOf(tokenId);
  if (owner.toLowerCase() !== deps.deployer.address.toLowerCase()) {
    throw new Error(`mint: owner mismatch ${owner}`);
  }
  if (creator.toLowerCase() !== deps.deployer.address.toLowerCase()) {
    throw new Error(`mint: creator mismatch ${creator}`);
  }
  const datas = await nftTc.contract.intelligentDatasOf(tokenId);
  const onChainHash = datas[0]?.dataHash;
  if (
    !onChainHash ||
    onChainHash.toLowerCase() !== deps.dataHash.toLowerCase()
  ) {
    throw new Error(`mint: on-chain dataHash ${onChainHash} != ${deps.dataHash}`);
  }
  markCovered("AxiomAgentNFT", "mint", "on-chain-mint");
  markCovered("AxiomAgentNFT", "mintFee", "on-chain-mint");
  markCovered("AxiomAgentNFT", "creatorOf", "on-chain-mint");
  markCovered("AxiomAgentNFT", "ownerOf", "on-chain-mint");
  markCovered("AxiomAgentNFT", "intelligentDatasOf", "on-chain-mint");
  recordOnChainStep({
    step: 6,
    name: "AxiomAgentNFT.mint",
    ok: true,
    summary: `tokenId=${tokenId} creator=${creator}`,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    chainId: deps.chainId,
  });
  return { tokenId, txHash: receipt.hash, blockNumber: receipt.blockNumber };
}

type VaultMethods = {
  deposit(tokenId: bigint, overrides?: { value?: bigint }): Promise<TransactionResponse>;
  balanceOf(tokenId: bigint): Promise<bigint>;
  setStrategy(
    tokenId: bigint,
    root: string,
    dailyLimit: bigint,
    validUntilDay: bigint,
  ): Promise<TransactionResponse>;
  strategyOf(
    tokenId: bigint,
  ): Promise<[string, bigint, bigint, bigint, bigint]>;
};

export async function runVaultDepositStep(deps: {
  vault: string;
  deployer: Wallet;
  tokenId: bigint;
  chainId: number;
  depositWei?: bigint;
}): Promise<bigint> {
  const amount = deps.depositWei ?? parseEther("0.001");
  console.log(`\n[Step 7]  Vault deposit ${amount} wei (tokenId=${deps.tokenId})`);
  const vaultTc = new TypedContract<VaultMethods>(
    deps.vault,
    VAULT_ABI,
    deps.deployer,
  );
  const before = await vaultTc.contract.balanceOf(deps.tokenId);
  const tx = await vaultTc.contract.deposit(deps.tokenId, { value: amount });
  const receipt = assertReceiptOk(await tx.wait(), "vault deposit");
  const after = await vaultTc.contract.balanceOf(deps.tokenId);
  if (after < before + amount) {
    throw new Error(
      `vault deposit: balance ${after} < expected ${before + amount}`,
    );
  }
  markCovered("AxiomStrategyVault", "deposit", "vault-deposit");
  recordOnChainStep({
    step: 7,
    name: "AxiomStrategyVault.deposit",
    ok: true,
    summary: `balance=${after} wei (+${after - before})`,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    chainId: deps.chainId,
  });
  return after;
}

export async function runVaultStrategyStep(deps: {
  vault: string;
  deployer: Wallet;
  tokenId: bigint;
  strategyRoot: `0x${string}`;
  chainId: number;
}): Promise<void> {
  console.log(`\n[Step 8]  Vault setStrategy (root=${deps.strategyRoot})`);
  const dailyLimit = parseEther("0.1");
  const vaultTc = new TypedContract<VaultMethods>(
    deps.vault,
    VAULT_ABI,
    deps.deployer,
  );
  const tx = await vaultTc.contract.setStrategy(
    deps.tokenId,
    deps.strategyRoot,
    dailyLimit,
    0n,
  );
  const receipt = assertReceiptOk(await tx.wait(), "setStrategy");
  const [root, limit, , , validUntil] = await vaultTc.contract.strategyOf(
    deps.tokenId,
  );
  if (root.toLowerCase() !== deps.strategyRoot.toLowerCase()) {
    throw new Error(`setStrategy: root on-chain ${root} != ${deps.strategyRoot}`);
  }
  if (limit !== dailyLimit) {
    throw new Error(`setStrategy: dailyLimit on-chain ${limit} != ${dailyLimit}`);
  }
  if (validUntil !== 0n) {
    throw new Error(`setStrategy: expected no expiry, got validUntilDay=${validUntil}`);
  }
  markCovered("AxiomStrategyVault", "setStrategy", "vault-setStrategy");
  markCovered("AxiomStrategyVault", "strategyOf", "vault-setStrategy");
  recordOnChainStep({
    step: 8,
    name: "AxiomStrategyVault.setStrategy",
    ok: true,
    summary: `root=${root} dailyLimit=${limit}`,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    chainId: deps.chainId,
  });
}

type PaymentMethods = {
  payForAgent(tokenId: bigint, amount: bigint): Promise<TransactionResponse>;
  agentEarningsOf(creator: string): Promise<bigint>;
};

type Erc20Methods = {
  approve(spender: string, amount: bigint): Promise<TransactionResponse>;
  balanceOf(account: string): Promise<bigint>;
  allowance(owner: string, spender: string): Promise<bigint>;
};

export async function runPaymentStep(deps: {
  paymentProcessor: string;
  paymentToken: string;
  deployer: Wallet;
  tokenId: bigint;
  chainId: number;
  payAmount?: bigint;
}): Promise<void> {
  const amount = deps.payAmount ?? parseUnits("1", 6);
  console.log(
    `\n[Step 9b] payForAgent on-chain (tokenId=${deps.tokenId} amount=${amount})`,
  );
  const tokenTc = new TypedContract<Erc20Methods>(
    deps.paymentToken,
    ERC20_ABI,
    deps.deployer,
  );
  const procTc = new TypedContract<PaymentMethods>(
    deps.paymentProcessor,
    PAYMENT_PROCESSOR_ABI,
    deps.deployer,
  );
  const balance = await tokenTc.contract.balanceOf(deps.deployer.address);
  if (balance < amount) {
    throw new Error(
      `payment: insufficient ${deps.paymentToken} balance ${balance} < ${amount}`,
    );
  }
  const earningsBefore = await procTc.contract.agentEarningsOf(deps.deployer.address);
  const allowance = await tokenTc.contract.allowance(
    deps.deployer.address,
    deps.paymentProcessor,
  );
  markCovered("MockUSDC", "balanceOf", "payForAgent");
  markCovered("MockUSDC", "allowance", "payForAgent");
  if (allowance < amount) {
    const approveTx = await tokenTc.contract.approve(
      deps.paymentProcessor,
      amount,
    );
    assertReceiptOk(await approveTx.wait(), "ERC20 approve");
    markCovered("MockUSDC", "approve", "payForAgent");
  }
  const tx = await procTc.contract.payForAgent(deps.tokenId, amount);
  const receipt = assertReceiptOk(await tx.wait(), "payForAgent");
  const earningsAfter = await procTc.contract.agentEarningsOf(deps.deployer.address);
  if (earningsAfter <= earningsBefore) {
    throw new Error(
      `payForAgent: creator earnings did not increase (${earningsBefore} -> ${earningsAfter})`,
    );
  }
  markCovered("AxiomPaymentProcessor", "payForAgent", "payForAgent");
  markCovered("AxiomPaymentProcessor", "agentEarningsOf", "payForAgent");
  recordOnChainStep({
    step: 9,
    name: "AxiomPaymentProcessor.payForAgent",
    ok: true,
    summary: `earnings ${earningsBefore} -> ${earningsAfter}`,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    chainId: deps.chainId,
  });
}

/** @deprecated Use runOracleRegisterStep */
export const runMintStep = runOracleRegisterStep;

export async function runTickStep(deps: {
  backendUrl: string;
  postStep: PostStep;
  vault: string;
  agentNft: string;
  tokenId: string;
  vaultBalanceWei: bigint;
}): Promise<void> {
  console.log("\n[Step 9]  POST /v1/orchestrator/tick (live vault balance)");
  await deps.postStep<{
    recommendation?: { action: string; reason: string };
    rawModelOutput?: string;
    durationMs?: number;
    error?: string;
  }>(
    deps.backendUrl,
    9,
    "/v1/orchestrator/tick",
    {
      vault: deps.vault,
      agentNft: deps.agentNft,
      agentTokenId: deps.tokenId,
      strategy: "hold",
      signalSource: "manual:e2e",
      signalPayload: {
        vaultBalance: deps.vaultBalanceWei.toString(),
        recentTrades: [],
      },
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

export interface FinalResponse {
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
    `\n[Step 10] POST /v1/agents/${deps.tokenId}/transfer (challenge → sign → final)`,
  );
  const challenge = await deps.postStep<ChallengeResponse>(
    deps.backendUrl,
    10,
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
    10,
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
  chainId: number;
}): Promise<void> {
  console.log(`\n[Step 11] AxiomAgentNFT.iTransferFrom on-chain (provable)`);
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
    recordOnChainStep({
      step: 11,
      name: "iTransferFrom on-chain",
      ok: false,
      summary: `owner=${currentOwner} expected deployer ${deps.deployer.address}`,
      chainId: deps.chainId,
    });
    throw new Error(
      `iTransferFrom: tokenId=${deps.tokenId} owned by ${currentOwner}, not deployer`,
    );
  }
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
      const receipt = assertReceiptOk(await tx.wait(), "iTransferFrom");
      const transferLog = receipt.logs.find(
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
      if (newOwner.toLowerCase() !== deps.to.toLowerCase()) {
        throw new Error(`post-transfer owner ${newOwner} != receiver ${deps.to}`);
      }
      markCovered("AxiomAgentNFT", "iTransferFrom", "iTransferFrom");
      markCovered("AxiomAgentNFT", "ownerOf", "iTransferFrom");
      markCovered("AxiomTeeVerifier", "verifyTransferValidity", "iTransferFrom");
      recordOnChainStep({
        step: 11,
        name: "iTransferFrom on-chain",
        ok: true,
        summary: `owner=${newOwner} accessSigner=${recoveredAddr}`,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        chainId: deps.chainId,
      });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    recordOnChainStep({
      step: 11,
      name: "iTransferFrom on-chain",
      ok: false,
      summary: `reverted: ${msg.slice(0, 120)}`,
      chainId: deps.chainId,
    });
    throw e;
  }
}

export function printReport(options?: { parityMinPct?: number }): void {
  console.log("\n============================================");
  console.log("  E2E Summary (live + on-chain proofs)");
  console.log("============================================");
  for (const r of stepResults) {
    const flag = r.ok ? "[OK]" : "[FAIL]";
    const block =
      r.blockNumber !== undefined ? ` block=${r.blockNumber}` : "";
    console.log(
      `  Step ${String(r.step).padStart(2)} ${flag}  ${r.name.padEnd(28)}  ${r.summary}${block}`,
    );
    if (r.explorerUrl) {
      console.log(`        ↳ ${r.explorerUrl}`);
    }
  }
  const passed = stepResults.filter((r) => r.ok).length;
  console.log(`\n  ${passed}/${stepResults.length} steps passed`);

  const parity = printParityMatrix();
  const minPct = options?.parityMinPct ?? 90;
  if (passed < stepResults.length) process.exit(1);
  try {
    assertParityGate(minPct);
  } catch (e) {
    console.error(`\n  ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  console.log(`\n  Parity gate passed (${parity.actionablePct}% >= ${minPct}%)`);
}