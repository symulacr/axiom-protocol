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
import {
  detectVaultAbiVariant,
  readVaultStrategy,
  vaultAbiFor,
} from "./vault-compat.js";
import { TRANSFER_TOPIC } from "../../utils/constants.js";
import type { fetchJson as fetchJsonFn } from "../../utils/fetch-json.js";
import { postStep as postStepFn, stepResults } from "./http.js";
import {
  addressExplorerUrl,
  assertContractDeployed,
  assertReceiptOk,
  recordOnChainStep,
  recordReceipt,
} from "./onchain.js";
import { markCovered, printParityMatrix } from "./matrix.js";
import { markScenarioCovered, printUsageScenarioMatrix } from "./scenarios.js";
import { printFrictionReport } from "./friction.js";
import { enforceLiveGate } from "./eval.js";
import { printScenarioBreakReport } from "./scenario-breaks.js";
import { pipelineWalletTxs } from "./tx-pipeline.js";
import { ensureErc20Allowance } from "./erc20.js";

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
  await Promise.all(
    checks.map(async ({ address, label }) => {
      await assertContractDeployed(deps.provider, address, label);
      console.log(
        `          ${label} live at ${address} (${addressExplorerUrl(deps.chainId, address)})`,
      );
    }),
  );
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
  if (health.ok === true) {
    markScenarioCovered("api.health", "health", { reads: 1 });
  }
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
  markScenarioCovered("storage.upload", "upload", { txs: 1 });
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
  markScenarioCovered("storage.verify", "merkle-verify", { reads: 1 });
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
  markScenarioCovered("oracle.preregister", "oracle-mint", { reads: 1 });
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
  markScenarioCovered("agent.mint", "on-chain-mint", { txs: 1, reads: 4 });
  markCovered("AxiomAgentNFT", "mint", "on-chain-mint");
  markCovered("AxiomAgentNFT", "mintFee", "on-chain-mint");
  markCovered("AxiomAgentNFT", "creatorOf", "on-chain-mint");
  markCovered("AxiomAgentNFT", "ownerOf", "on-chain-mint");
  markCovered("AxiomAgentNFT", "intelligentDatasOf", "on-chain-mint");
  recordReceipt(6, "AxiomAgentNFT.mint", `tokenId=${tokenId} creator=${creator}`, receipt, deps.chainId);
  return { tokenId, txHash: receipt.hash, blockNumber: receipt.blockNumber };
}

type VaultMethods = {
  deposit(tokenId: bigint, overrides?: { value?: bigint }): Promise<TransactionResponse>;
  balanceOf(tokenId: bigint): Promise<bigint>;
  setStrategy(
    tokenId: bigint,
    root: string,
    dailyLimit: bigint,
    validUntilDay?: bigint,
  ): Promise<TransactionResponse>;
};

export async function runVaultDepositStrategyPipeline(deps: {
  vault: string;
  deployer: Wallet;
  tokenId: bigint;
  strategyRoot: `0x${string}`;
  chainId: number;
  depositWei?: bigint;
}): Promise<bigint> {
  const amount = deps.depositWei ?? parseEther("0.001");
  const dailyLimit = parseEther("0.1");
  const provider = deps.deployer.provider;
  if (!provider) throw new Error("vault pipeline: wallet missing provider");
  const variant = await detectVaultAbiVariant(provider, deps.vault);
  if (variant === "legacy") {
    console.log("          legacy vault ABI (3-arg setStrategy)");
  }
  const vaultTc = new TypedContract<VaultMethods>(
    deps.vault,
    vaultAbiFor(variant),
    deps.deployer,
  );
  const before = await vaultTc.contract.balanceOf(deps.tokenId);
  console.log(
    `\n[Step 7–8] Vault deposit ${amount} + setStrategy (pipelined)`,
  );
  const vaultPipelineReceipts = await pipelineWalletTxs(
    "vault deposit+setStrategy",
    [
      {
        name: "AxiomStrategyVault.deposit",
        send: () => vaultTc.contract.deposit(deps.tokenId, { value: amount }),
      },
      {
        name: "AxiomStrategyVault.setStrategy",
        send: () =>
          variant === "legacy"
            ? vaultTc.contract.setStrategy(
                deps.tokenId,
                deps.strategyRoot,
                dailyLimit,
              )
            : vaultTc.contract.setStrategy(
                deps.tokenId,
                deps.strategyRoot,
                dailyLimit,
                0n,
              ),
      },
    ],
  );
  const depReceipt = vaultPipelineReceipts[0]!;
  const stratReceipt = vaultPipelineReceipts[1]!;
  const after = await vaultTc.contract.balanceOf(deps.tokenId);
  if (after < before + amount) {
    throw new Error(`vault deposit: balance ${after} < expected ${before + amount}`);
  }
  const { root, dailyLimit: limit, validUntilDay: validUntil } =
    await readVaultStrategy(provider, deps.vault, deps.tokenId);
  if (root.toLowerCase() !== deps.strategyRoot.toLowerCase()) {
    throw new Error(`setStrategy: root on-chain ${root} != ${deps.strategyRoot}`);
  }
  markScenarioCovered("vault.fund", "vault-deposit", { txs: 1, reads: 2 });
  markScenarioCovered("vault.strategy", "vault-setStrategy", { txs: 1, reads: 1 });
  markCovered("AxiomStrategyVault", "deposit", "vault-deposit");
  markCovered("AxiomStrategyVault", "setStrategy", "vault-setStrategy");
  markCovered("AxiomStrategyVault", "strategyOf", "vault-setStrategy");
  recordReceipt(7, "AxiomStrategyVault.deposit", `balance=${after} wei (+${after - before})`, depReceipt, deps.chainId);
  recordReceipt(8, "AxiomStrategyVault.setStrategy", `root=${root} dailyLimit=${limit}`, stratReceipt, deps.chainId);
  void validUntil;
  return after;
}

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
  markScenarioCovered("vault.fund", "vault-deposit", { txs: 1, reads: 2 });
  markCovered("AxiomStrategyVault", "deposit", "vault-deposit");
  recordReceipt(7, "AxiomStrategyVault.deposit", `balance=${after} wei (+${after - before})`, receipt, deps.chainId);
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
  const provider = deps.deployer.provider;
  if (!provider) throw new Error("setStrategy: wallet missing provider");
  const variant = await detectVaultAbiVariant(provider, deps.vault);
  if (variant === "legacy") {
    console.log("          legacy vault ABI (3-arg setStrategy, no validUntilDay)");
  }
  const vaultTc = new TypedContract<VaultMethods>(
    deps.vault,
    vaultAbiFor(variant),
    deps.deployer,
  );
  const tx =
    variant === "legacy"
      ? await vaultTc.contract.setStrategy(
          deps.tokenId,
          deps.strategyRoot,
          dailyLimit,
        )
      : await vaultTc.contract.setStrategy(
          deps.tokenId,
          deps.strategyRoot,
          dailyLimit,
          0n,
        );
  const receipt = assertReceiptOk(await tx.wait(), "setStrategy");
  const { root, dailyLimit: limit, validUntilDay: validUntil } =
    await readVaultStrategy(provider, deps.vault, deps.tokenId);
  if (root.toLowerCase() !== deps.strategyRoot.toLowerCase()) {
    throw new Error(`setStrategy: root on-chain ${root} != ${deps.strategyRoot}`);
  }
  if (limit !== dailyLimit) {
    throw new Error(`setStrategy: dailyLimit on-chain ${limit} != ${dailyLimit}`);
  }
  if (variant === "current" && validUntil !== 0n) {
    throw new Error(`setStrategy: expected no expiry, got validUntilDay=${validUntil}`);
  }
  markScenarioCovered("vault.strategy", "vault-setStrategy", { txs: 1, reads: 1 });
  markCovered("AxiomStrategyVault", "setStrategy", "vault-setStrategy");
  markCovered("AxiomStrategyVault", "strategyOf", "vault-setStrategy");
  recordReceipt(8, "AxiomStrategyVault.setStrategy", `root=${root} dailyLimit=${limit}`, receipt, deps.chainId);
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
  await ensureErc20Allowance({
    token: deps.paymentToken,
    owner: deps.deployer,
    spender: deps.paymentProcessor,
    amount,
    step: "payForAgent",
  });
  const tx = await procTc.contract.payForAgent(deps.tokenId, amount);
  const receipt = assertReceiptOk(await tx.wait(), "payForAgent");
  const earningsAfter = await procTc.contract.agentEarningsOf(deps.deployer.address);
  if (earningsAfter <= earningsBefore) {
    throw new Error(
      `payForAgent: creator earnings did not increase (${earningsBefore} -> ${earningsAfter})`,
    );
  }
  markScenarioCovered("payment.agent", "payForAgent", { txs: 1, reads: 2 });
  markCovered("AxiomPaymentProcessor", "payForAgent", "payForAgent");
  markCovered("AxiomPaymentProcessor", "agentEarningsOf", "payForAgent");
  recordReceipt(9, "AxiomPaymentProcessor.payForAgent", `earnings ${earningsBefore} -> ${earningsAfter}`, receipt, deps.chainId);
}

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
  markScenarioCovered("orchestrator.tick", "tick", { reads: 1 });
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
  markScenarioCovered("transfer.proof", "transfer-api-prep", { reads: 1 });
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
  markScenarioCovered("transfer.proof", "transfer-api", { reads: 2 });
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
      markScenarioCovered("transfer.onchain", "iTransferFrom", { txs: 1, reads: 2 });
      markCovered("AxiomAgentNFT", "iTransferFrom", "iTransferFrom");
      markCovered("AxiomAgentNFT", "ownerOf", "iTransferFrom");
      markCovered("AxiomTeeVerifier", "verifyTransferValidity", "iTransferFrom");
      recordReceipt(11, "iTransferFrom on-chain", `owner=${newOwner} accessSigner=${recoveredAddr}`, receipt, deps.chainId);
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

export function printReport(options?: { liveGateMinPct?: number }): void {
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

  printUsageScenarioMatrix();
  printParityMatrix();
  printFrictionReport();
  printScenarioBreakReport();
  const liveMin = options?.liveGateMinPct ?? 85;
  if (passed < stepResults.length) process.exit(1);
  try {
    enforceLiveGate(liveMin);
  } catch (e) {
    console.error(`\n  ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}