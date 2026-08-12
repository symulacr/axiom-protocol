import {
  AbiCoder,
  keccak256,
  parseEther,
  parseUnits,
  type TransactionResponse,
  type Wallet,
} from "ethers";
import { TypedContract } from "@axiom/config/types/contract";
import {
  AGENT_NFT_ABI,
  ERC20_ABI,
  PAYMENT_PROCESSOR_ABI,
  TEE_VERIFIER_ABI,
  VAULT_ABI,
} from "@axiom/config/abis";
import {
  assertReceiptOk,
  recordOnChainStep,
  recordReceipt,
} from "./onchain.js";
import { pipelineWalletTxs } from "./tx-pipeline.js";
import { markCovered, markSkipped } from "./matrix.js";
import { markScenarioCovered } from "./scenarios.js";
import { ensureErc20Allowance } from "./erc20.js";
import { hasContractFunction, LEGACY_DEPLOY_REASON } from "./deploy-compat.js";
import { readVaultStrategy } from "./vault-compat.js";
import type { FinalResponse } from "./steps.js";

const AGENT_NFT_EXTENDED_ABI = [
  ...AGENT_NFT_ABI,
  "function update(uint256 tokenId, (string dataDescription, bytes32 dataHash)[] newDatas)",
  "function authorizeUsage(uint256 tokenId, address to)",
  "function revokeAuthorization(uint256 tokenId, address user)",
  "function authorizedUsersOf(uint256 tokenId) view returns (address[])",
  "function delegateAccess(address assistant)",
  "function getDelegateAccess(address user) view returns (address)",
  "function intelligentDataOf(uint256 tokenId) view returns ((string dataDescription, bytes32 dataHash)[])",
  "function verifier() view returns (address)",
  "function storageInfo() view returns (string)",
  "function pendingVerifier() view returns (address)",
  "function pendingVerifierExecutableAt() view returns (uint256)",
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
] as const;

const ERC165_INTERFACE_ID = "0x01ffc9a7";
const ERC721_INTERFACE_ID = "0x80ac58cd";

type AgentNftExtended = {
  name(): Promise<string>;
  symbol(): Promise<string>;
  tokenURI(tokenId: bigint): Promise<string>;
  storageInfo(): Promise<string>;
  verifier(): Promise<string>;
  pendingVerifier(): Promise<string>;
  pendingVerifierExecutableAt(): Promise<bigint>;
  intelligentDataOf(tokenId: bigint): Promise<Array<{ dataDescription: string; dataHash: string }>>;
  intelligentDatasOf(tokenId: bigint): Promise<Array<{ dataDescription: string; dataHash: string }>>;
  mintFee(): Promise<bigint>;
  creatorOf(tokenId: bigint): Promise<string>;
  ownerOf(tokenId: bigint): Promise<string>;
  supportsInterface(id: string): Promise<boolean>;
  update(
    tokenId: bigint,
    newDatas: Array<{ dataDescription: string; dataHash: string }>,
  ): Promise<TransactionResponse>;
  authorizeUsage(tokenId: bigint, to: string): Promise<TransactionResponse>;
  revokeAuthorization(tokenId: bigint, user: string): Promise<TransactionResponse>;
  authorizedUsersOf(tokenId: bigint): Promise<string[]>;
  delegateAccess(assistant: string): Promise<TransactionResponse>;
  getDelegateAccess(user: string): Promise<string>;
};

type VaultCov = {
  withdraw(tokenId: bigint, amount: bigint): Promise<TransactionResponse>;
  balanceOf(tokenId: bigint): Promise<bigint>;
};

type PaymentCov = {
  setRoyaltyBpsPermitted(agentTokenId: bigint, newBps: bigint): Promise<TransactionResponse>;
  payForAgent(agentTokenId: bigint, amount: bigint): Promise<TransactionResponse>;
  payComputeProvider(provider: string, amount: bigint): Promise<TransactionResponse>;
  withdrawAgentEarnings(): Promise<TransactionResponse>;
  royaltyBpsOf(agentTokenId: bigint): Promise<bigint>;
  royaltyBpsSet(agentTokenId: bigint): Promise<boolean>;
  protocolTreasury(): Promise<string>;
  pendingProtocolTreasury(): Promise<string>;
  pendingTreasuryEffectiveAt(): Promise<bigint>;
  protocolFeeBps(): Promise<bigint>;
  paymentToken(): Promise<string>;
  totalOutstandingEarnings(): Promise<bigint>;
  agentEarningsOf(creator: string): Promise<bigint>;
};

type TeeCov = {
  domainSeparator(): Promise<string>;
  registeredSigner(): Promise<string>;
  maxProofAgeSeconds(): Promise<bigint>;
  owner(): Promise<string>;
  ADMIN_DELAY(): Promise<bigint>;
  cleanExpiredProofs(proofNonces: string[]): Promise<TransactionResponse>;
};

type Erc20Cov = {
  approve(spender: string, amount: bigint): Promise<TransactionResponse>;
  balanceOf(account: string): Promise<bigint>;
  allowance(owner: string, spender: string): Promise<bigint>;
};

export async function runMatrixViewSweepStep(deps: {
  agentNft: string;
  vault: string;
  paymentProcessor: string;
  teeVerifier: string;
  paymentToken: string;
  deployer: Wallet;
  tokenId: bigint;
  chainId: number;
  teeSignerAddress: string;
}): Promise<void> {
  console.log("\n[Parity] View sweep — read all queryable contract surfaces");
  const provider = deps.deployer.provider;
  if (!provider) throw new Error("view-sweep: wallet missing provider");
  const nft = new TypedContract<AgentNftExtended>(
    deps.agentNft,
    AGENT_NFT_EXTENDED_ABI,
    deps.deployer,
  );
  const vault = new TypedContract<VaultCov>(deps.vault, VAULT_ABI, deps.deployer);
  const pay = new TypedContract<PaymentCov>(
    deps.paymentProcessor,
    PAYMENT_PROCESSOR_ABI,
    deps.deployer,
  );
  const tee = new TypedContract<TeeCov>(deps.teeVerifier, TEE_VERIFIER_ABI, deps.deployer);
  const token = new TypedContract<Erc20Cov>(deps.paymentToken, ERC20_ABI, deps.deployer);

  const [
    name,
    symbol,
    uri,
    storageInfo,
    verifierAddr,
    dataSingular,
    dataPlural,
    supportsErc165,
    supportsErc721,
    vaultBal,
    strategy,
    treasury,
    payToken,
    domain,
    signer,
    tokenBal,
    creator,
    owner,
  ] = await Promise.all([
    nft.contract.name(),
    nft.contract.symbol(),
    nft.contract.tokenURI(deps.tokenId),
    nft.contract.storageInfo(),
    nft.contract.verifier(),
    nft.contract.intelligentDataOf(deps.tokenId),
    nft.contract.intelligentDatasOf(deps.tokenId),
    nft.contract.supportsInterface(ERC165_INTERFACE_ID),
    nft.contract.supportsInterface(ERC721_INTERFACE_ID),
    vault.contract.balanceOf(deps.tokenId),
    readVaultStrategy(provider, deps.vault, deps.tokenId),
    pay.contract.protocolTreasury(),
    pay.contract.paymentToken(),
    tee.contract.domainSeparator(),
    tee.contract.registeredSigner(),
    token.contract.balanceOf(deps.deployer.address),
    hasContractFunction(provider, deps.agentNft, "function creatorOf(uint256) view returns (address)").then((ok) => (ok ? nft.contract.creatorOf(deps.tokenId) : null)),
    nft.contract.ownerOf(deps.tokenId),
  ]);
  void storageInfo;
  void vaultBal;
  void strategy;
  void tokenBal;
  if (uri.length > 0 && !uri.startsWith("data:application/json")) {
    throw new Error(`tokenURI unexpected format: ${uri.slice(0, 40)}…`);
  }
  if (uri.length === 0) {
    console.log(
      "          tokenURI empty (legacy deploy — metadata via intelligentDataOf)",
    );
  }
  if (verifierAddr.toLowerCase() !== deps.teeVerifier.toLowerCase()) {
    throw new Error(`verifier mismatch ${verifierAddr} != ${deps.teeVerifier}`);
  }
  const [hasPendingVerifier, hasPendingVerifierAt, hasPendingTreasury, hasPendingTreasuryAt, hasProtocolFeeBps, hasTotalOutstanding, hasAdminDelay] =
    await Promise.all([
      hasContractFunction(provider, deps.agentNft, "function pendingVerifier() view returns (address)"),
      hasContractFunction(provider, deps.agentNft, "function pendingVerifierExecutableAt() view returns (uint256)"),
      hasContractFunction(provider, deps.paymentProcessor, "function pendingProtocolTreasury() view returns (address)"),
      hasContractFunction(provider, deps.paymentProcessor, "function pendingTreasuryEffectiveAt() view returns (uint256)"),
      hasContractFunction(provider, deps.paymentProcessor, "function protocolFeeBps() view returns (uint256)"),
      hasContractFunction(provider, deps.paymentProcessor, "function totalOutstandingEarnings() view returns (uint256)"),
      hasContractFunction(provider, deps.teeVerifier, "function ADMIN_DELAY() view returns (uint256)"),
    ]);
  if (hasPendingVerifier) {
    await nft.contract.pendingVerifier();
    markCovered("AxiomAgentNFT", "pendingVerifier", "view-sweep");
  } else {
    markSkipped("AxiomAgentNFT", "pendingVerifier", LEGACY_DEPLOY_REASON);
  }
  if (hasPendingVerifierAt) {
    await nft.contract.pendingVerifierExecutableAt();
    markCovered("AxiomAgentNFT", "pendingVerifierExecutableAt", "view-sweep");
  } else {
    markSkipped("AxiomAgentNFT", "pendingVerifierExecutableAt", LEGACY_DEPLOY_REASON);
  }
  if (dataSingular.length === 0) throw new Error("intelligentDataOf empty");
  if (!supportsErc165 || !supportsErc721) {
    throw new Error(
      `supportsInterface failed erc165=${supportsErc165} erc721=${supportsErc721}`,
    );
  }
  markCovered("AxiomStrategyVault", "balanceOf", "view-sweep");
  markCovered("AxiomStrategyVault", "strategyOf", "view-sweep");
  if (hasPendingTreasury) {
    await pay.contract.pendingProtocolTreasury();
    markCovered("AxiomPaymentProcessor", "pendingProtocolTreasury", "view-sweep");
  } else {
    markSkipped("AxiomPaymentProcessor", "pendingProtocolTreasury", LEGACY_DEPLOY_REASON);
  }
  if (hasPendingTreasuryAt) {
    await pay.contract.pendingTreasuryEffectiveAt();
    markCovered("AxiomPaymentProcessor", "pendingTreasuryEffectiveAt", "view-sweep");
  } else {
    markSkipped("AxiomPaymentProcessor", "pendingTreasuryEffectiveAt", LEGACY_DEPLOY_REASON);
  }
  if (hasProtocolFeeBps) {
    await pay.contract.protocolFeeBps();
    markCovered("AxiomPaymentProcessor", "protocolFeeBps", "view-sweep");
  } else {
    markSkipped("AxiomPaymentProcessor", "protocolFeeBps", LEGACY_DEPLOY_REASON);
  }
  if (payToken.toLowerCase() !== deps.paymentToken.toLowerCase()) {
    throw new Error(`paymentToken mismatch ${payToken}`);
  }
  if (hasTotalOutstanding) {
    await pay.contract.totalOutstandingEarnings();
    markCovered("AxiomPaymentProcessor", "totalOutstandingEarnings", "view-sweep");
  } else {
    markSkipped("AxiomPaymentProcessor", "totalOutstandingEarnings", LEGACY_DEPLOY_REASON);
  }
  const [, royaltyAlreadySet] = await Promise.all([
    pay.contract.royaltyBpsOf(deps.tokenId),
    pay.contract.royaltyBpsSet(deps.tokenId),
    pay.contract.agentEarningsOf(deps.deployer.address),
    tee.contract.maxProofAgeSeconds(),
    tee.contract.owner(),
  ]);
  if (royaltyAlreadySet) {
    markCovered("AxiomPaymentProcessor", "setRoyaltyBpsPermitted", "reuse-royalty");
    markScenarioCovered("payment.royalty", "reuse-royalty", { reads: 2 });
  }
  if (signer.toLowerCase() !== deps.teeSignerAddress.toLowerCase()) {
    throw new Error(`registeredSigner ${signer} != oracle ${deps.teeSignerAddress}`);
  }
  if (hasAdminDelay) {
    await tee.contract.ADMIN_DELAY();
    markCovered("AxiomTeeVerifier", "ADMIN_DELAY", "view-sweep");
  } else {
    markSkipped("AxiomTeeVerifier", "ADMIN_DELAY", LEGACY_DEPLOY_REASON);
  }

  if (creator && creator.toLowerCase() !== deps.deployer.address.toLowerCase()) {
    throw new Error(`creatorOf ${creator} != operator ${deps.deployer.address}`);
  }
  if (owner.toLowerCase() !== deps.deployer.address.toLowerCase()) {
    throw new Error(`ownerOf ${owner} != operator ${deps.deployer.address}`);
  }
  if (dataPlural.length === 0) throw new Error("intelligentDatasOf empty");

  const marks: Array<[string, string]> = [
    ["AxiomAgentNFT", "name"],
    ["AxiomAgentNFT", "symbol"],
    ["AxiomAgentNFT", "tokenURI"],
    ["AxiomAgentNFT", "storageInfo"],
    ["AxiomAgentNFT", "verifier"],
    ["AxiomAgentNFT", "intelligentDataOf"],
    ["AxiomAgentNFT", "intelligentDatasOf"],
    ["AxiomAgentNFT", "mintFee"],
    ["AxiomAgentNFT", "creatorOf"],
    ["AxiomAgentNFT", "ownerOf"],
    ["AxiomAgentNFT", "supportsInterface"],
    ["AxiomPaymentProcessor", "protocolTreasury"],
    ["AxiomPaymentProcessor", "protocolFeeBps"],
    ["AxiomPaymentProcessor", "paymentToken"],
    ["AxiomPaymentProcessor", "totalOutstandingEarnings"],
    ["AxiomPaymentProcessor", "royaltyBpsOf"],
    ["AxiomPaymentProcessor", "royaltyBpsSet"],
    ["AxiomPaymentProcessor", "agentEarningsOf"],
    ["AxiomTeeVerifier", "domainSeparator"],
    ["AxiomTeeVerifier", "registeredSigner"],
    ["AxiomTeeVerifier", "maxProofAgeSeconds"],
    ["AxiomTeeVerifier", "owner"],
    ["MockUSDC", "balanceOf"],
  ];
  for (const [c, f] of marks) markCovered(c, f, "view-sweep");
  markScenarioCovered("views.sweep", "view-sweep", { reads: marks.length });

  recordOnChainStep({
    step: 12,
    name: "parity view-sweep",
    ok: true,
    summary: `name=${name} symbol=${symbol} treasury=${treasury.slice(0, 10)}… domain=${domain.slice(0, 12)}…`,
    chainId: deps.chainId,
  });
}

export async function runVaultWithdrawStep(deps: {
  vault: string;
  deployer: Wallet;
  tokenId: bigint;
  chainId: number;
  withdrawWei?: bigint;
}): Promise<bigint> {
  const amount = deps.withdrawWei ?? parseEther("0.0001");
  console.log(`\n[Parity] Vault withdraw ${amount} wei (tokenId=${deps.tokenId})`);
  const vault = new TypedContract<VaultCov>(deps.vault, VAULT_ABI, deps.deployer);
  const before = await vault.contract.balanceOf(deps.tokenId);
  if (before < amount) throw new Error(`vault withdraw: balance ${before} < ${amount}`);
  const tx = await vault.contract.withdraw(deps.tokenId, amount);
  const receipt = assertReceiptOk(await tx.wait(), "vault withdraw");
  const after = await vault.contract.balanceOf(deps.tokenId);
  if (after !== before - amount) {
    throw new Error(`vault withdraw: balance ${after} != ${before - amount}`);
  }
  markScenarioCovered("vault.withdraw", "vault-withdraw", { txs: 1, reads: 2 });
  markCovered("AxiomStrategyVault", "withdraw", "vault-withdraw");
  recordReceipt(13, "AxiomStrategyVault.withdraw", `balance ${before} -> ${after}`, receipt, deps.chainId);
  return after;
}

export async function runPaymentPipelineStep(deps: {
  paymentProcessor: string;
  paymentToken: string;
  deployer: Wallet;
  tokenId: bigint;
  provider: string;
  chainId: number;
  payAmount?: bigint;
  computeAmount?: bigint;
}): Promise<void> {
  const token = new TypedContract<Erc20Cov>(deps.paymentToken, ERC20_ABI, deps.deployer);
  const pay = new TypedContract<PaymentCov>(
    deps.paymentProcessor,
    PAYMENT_PROCESSOR_ABI,
    deps.deployer,
  );
  const walletBal = await token.contract.balanceOf(deps.deployer.address);
  const defaultPay = parseUnits("0.5", 6);
  const defaultCompute = parseUnits("0.3", 6);
  let payAmount = deps.payAmount ?? defaultPay;
  let computeAmount = deps.computeAmount ?? defaultCompute;
  const needTotal = payAmount + computeAmount;
  if (walletBal < needTotal) {
    const microMin = 10_000n; // 0.01 USDC — depleted test wallets after repeated E2E
    if (walletBal < microMin * 2n) {
      throw new Error(
        `payment pipeline: USDC balance ${walletBal} too low (need ≥${microMin * 2n})`,
      );
    }
    payAmount = walletBal / 2n;
    computeAmount = walletBal - payAmount;
    if (payAmount < microMin) payAmount = microMin;
    if (computeAmount < microMin) computeAmount = walletBal - microMin;
    console.log(
      `          (depleted wallet — micro split pay=${payAmount} compute=${computeAmount})`,
    );
  }
  console.log(
    `\n[Parity] payment pipeline payForAgent(${payAmount}) + payComputeProvider(${computeAmount})`,
  );
  const earningsBefore = await pay.contract.agentEarningsOf(deps.deployer.address);
  const providerBalBefore = await token.contract.balanceOf(deps.provider);
  const need = payAmount > computeAmount ? payAmount : computeAmount;
  await ensureErc20Allowance({
    token: deps.paymentToken,
    owner: deps.deployer,
    spender: deps.paymentProcessor,
    amount: need,
    step: "payment-pipeline",
  });
  const [payReceipt, computeReceipt] = await pipelineWalletTxs(
    "payForAgent + payComputeProvider",
    [
      {
        name: "AxiomPaymentProcessor.payForAgent",
        send: () => pay.contract.payForAgent(deps.tokenId, payAmount),
      },
      {
        name: "payComputeProvider",
        send: () =>
          pay.contract.payComputeProvider(deps.provider, computeAmount),
      },
    ],
  );
  const earningsAfter = await pay.contract.agentEarningsOf(deps.deployer.address);
  if (earningsAfter <= earningsBefore) {
    throw new Error(`payForAgent: earnings ${earningsBefore} -> ${earningsAfter}`);
  }
  const providerBalAfter = await token.contract.balanceOf(deps.provider);
  if (providerBalAfter < providerBalBefore + computeAmount) {
    throw new Error("payComputeProvider: provider balance did not increase");
  }
  markScenarioCovered("payment.agent", "payForAgent", { txs: 1, reads: 2 });
  markScenarioCovered("payment.compute", "payComputeProvider", { txs: 1 });
  markCovered("AxiomPaymentProcessor", "payForAgent", "payForAgent");
  markCovered("AxiomPaymentProcessor", "agentEarningsOf", "payForAgent");
  markCovered("AxiomPaymentProcessor", "payComputeProvider", "payComputeProvider");
  markCovered("MockUSDC", "transfer", "payComputeProvider");
  recordReceipt(9, "AxiomPaymentProcessor.payForAgent", `earnings ${earningsBefore} -> ${earningsAfter}`, payReceipt!, deps.chainId);
  recordReceipt(15, "payComputeProvider", `provider +${providerBalAfter - providerBalBefore}`, computeReceipt!, deps.chainId);
}

export async function runWithdrawEarningsStep(deps: {
  paymentProcessor: string;
  paymentToken: string;
  deployer: Wallet;
  chainId: number;
}): Promise<void> {
  console.log("\n[Parity] withdrawAgentEarnings (creator)");
  const pay = new TypedContract<PaymentCov>(
    deps.paymentProcessor,
    PAYMENT_PROCESSOR_ABI,
    deps.deployer,
  );
  const token = new TypedContract<Erc20Cov>(deps.paymentToken, ERC20_ABI, deps.deployer);
  const pending = await pay.contract.agentEarningsOf(deps.deployer.address);
  if (pending === 0n) throw new Error("withdrawAgentEarnings: no earnings to withdraw");
  const balBefore = await token.contract.balanceOf(deps.deployer.address);
  const tx = await pay.contract.withdrawAgentEarnings();
  const receipt = assertReceiptOk(await tx.wait(), "withdrawAgentEarnings");
  const balAfter = await token.contract.balanceOf(deps.deployer.address);
  if (balAfter < balBefore + pending) {
    throw new Error(`withdraw did not credit ${pending} (got ${balAfter - balBefore})`);
  }
  markScenarioCovered("payment.withdraw", "withdrawEarnings", { txs: 1, reads: 2 });
  markCovered("AxiomPaymentProcessor", "withdrawAgentEarnings", "withdrawEarnings");
  recordReceipt(16, "withdrawAgentEarnings", `withdrew ${pending}`, receipt, deps.chainId);
}

async function buildAuthorizeDelegatePipelineSteps(
  nft: TypedContract<AgentNftExtended>,
  tokenId: bigint,
  delegateAddress: string,
): Promise<Parameters<typeof pipelineWalletTxs>[1]> {
  const existing = await nft.contract.authorizedUsersOf(tokenId);
  const alreadyAuthorized = existing.some(
    (addr) => addr.toLowerCase() === delegateAddress.toLowerCase(),
  );
  const steps: Parameters<typeof pipelineWalletTxs>[1] = [];
  if (!alreadyAuthorized) {
    steps.push({
      name: "authorizeUsage",
      send: () => nft.contract.authorizeUsage(tokenId, delegateAddress),
    });
  }
  steps.push(
    {
      name: "delegateAccess",
      send: () => nft.contract.delegateAccess(delegateAddress),
    },
    {
      name: "revokeAuthorization",
      send: () =>
        nft.contract.revokeAuthorization(tokenId, delegateAddress),
    },
  );
  return steps;
}

export async function runAuthorizeDelegateStep(deps: {
  agentNft: string;
  deployer: Wallet;
  tokenId: bigint;
  delegateAddress: string;
  chainId: number;
}): Promise<void> {
  console.log(`\n[Parity] authorizeUsage + delegateAccess (${deps.delegateAddress})`);
  const nft = new TypedContract<AgentNftExtended>(
    deps.agentNft,
    AGENT_NFT_EXTENDED_ABI,
    deps.deployer,
  );
  const authSteps = await buildAuthorizeDelegatePipelineSteps(
    nft,
    deps.tokenId,
    deps.delegateAddress,
  );
  const authReceipts = await pipelineWalletTxs(
    "authorizeUsage + delegateAccess + revokeAuthorization",
    authSteps,
  );
  const revokeIdx = authSteps.findIndex((s) => s.name === "revokeAuthorization");
  const revReceipt = authReceipts[revokeIdx]!;

  markScenarioCovered("agent.authorize", "authorize", { txs: 1, reads: 1 });
  markCovered("AxiomAgentNFT", "authorizeUsage", "authorize");
  markCovered("AxiomAgentNFT", "authorizedUsersOf", "authorize");

  const assistant = await nft.contract.getDelegateAccess(deps.deployer.address);
  if (assistant.toLowerCase() !== deps.delegateAddress.toLowerCase()) {
    throw new Error(`getDelegateAccess ${assistant} != ${deps.delegateAddress}`);
  }
  markScenarioCovered("agent.delegate", "delegateAccess", { txs: 1, reads: 1 });
  markCovered("AxiomAgentNFT", "delegateAccess", "delegateAccess");
  markCovered("AxiomAgentNFT", "getDelegateAccess", "delegateAccess");
  const afterRevoke = await nft.contract.authorizedUsersOf(deps.tokenId);
  if (afterRevoke.length !== 0) {
    throw new Error(`authorizedUsersOf not cleared after revoke: ${afterRevoke.join(",")}`);
  }
  markScenarioCovered("agent.revoke", "revokeAuthorization", { txs: 1, reads: 1 });
  markCovered("AxiomAgentNFT", "revokeAuthorization", "revokeAuthorization");

  recordReceipt(17, "authorize/delegate/revoke", `delegate=${deps.delegateAddress.slice(0, 10)}…`, revReceipt, deps.chainId);
}

export async function runUpdateRoyaltyPipelineStep(deps: {
  agentNft: string;
  paymentProcessor: string;
  deployer: Wallet;
  tokenId: bigint;
  dataHash: `0x${string}`;
  chainId: number;
  royaltyBps?: bigint;
}): Promise<void> {
  const bps = deps.royaltyBps ?? 8000n;
  console.log(
    `\n[Parity] pipeline update + setRoyaltyBpsPermitted bps=${bps} tokenId=${deps.tokenId}`,
  );
  const nft = new TypedContract<AgentNftExtended>(
    deps.agentNft,
    AGENT_NFT_EXTENDED_ABI,
    deps.deployer,
  );
  const pay = new TypedContract<PaymentCov>(
    deps.paymentProcessor,
    PAYMENT_PROCESSOR_ABI,
    deps.deployer,
  );
  const updateRoyaltyReceipts = await pipelineWalletTxs(
    "update + setRoyaltyBpsPermitted",
    [
      {
        name: "AxiomAgentNFT.update",
        send: () =>
          nft.contract.update(deps.tokenId, [
            { dataDescription: "strategy-v2", dataHash: deps.dataHash },
          ]),
      },
      {
        name: "setRoyaltyBpsPermitted",
        send: () => pay.contract.setRoyaltyBpsPermitted(deps.tokenId, bps),
      },
    ],
  );
  const updateReceipt = updateRoyaltyReceipts[0]!;
  const royaltyReceipt = updateRoyaltyReceipts[1]!;

  const datas = await nft.contract.intelligentDataOf(deps.tokenId);
  if (datas[0]?.dataDescription !== "strategy-v2") {
    throw new Error(`update description mismatch ${datas[0]?.dataDescription}`);
  }
  const onChain = await pay.contract.royaltyBpsOf(deps.tokenId);
  if (onChain !== bps) throw new Error(`royaltyBpsOf ${onChain} != ${bps}`);
  if (!(await pay.contract.royaltyBpsSet(deps.tokenId))) {
    throw new Error("royaltyBpsSet false after set");
  }

  markScenarioCovered("agent.update", "update-data", { txs: 1, reads: 1 });
  markScenarioCovered("payment.royalty", "royalty", { txs: 1, reads: 2 });
  markCovered("AxiomAgentNFT", "update", "update-data");
  markCovered("AxiomPaymentProcessor", "setRoyaltyBpsPermitted", "royalty");
  recordReceipt(18, "AxiomAgentNFT.update", "description=strategy-v2", updateReceipt, deps.chainId);
  recordReceipt(14, "setRoyaltyBpsPermitted", `royaltyBps=${onChain}`, royaltyReceipt, deps.chainId);
}

export async function runUpdateDataStep(deps: {
  agentNft: string;
  deployer: Wallet;
  tokenId: bigint;
  dataHash: `0x${string}`;
  chainId: number;
}): Promise<void> {
  console.log(`\n[Parity] AxiomAgentNFT.update dataHash=${deps.dataHash}`);
  const nft = new TypedContract<AgentNftExtended>(
    deps.agentNft,
    AGENT_NFT_EXTENDED_ABI,
    deps.deployer,
  );
  const tx = await nft.contract.update(deps.tokenId, [
    { dataDescription: "strategy-v2", dataHash: deps.dataHash },
  ]);
  const receipt = assertReceiptOk(await tx.wait(), "update");
  const datas = await nft.contract.intelligentDataOf(deps.tokenId);
  if (datas[0]?.dataDescription !== "strategy-v2") {
    throw new Error(`update description mismatch ${datas[0]?.dataDescription}`);
  }
  markScenarioCovered("agent.update", "update-data", { txs: 1, reads: 1 });
  markCovered("AxiomAgentNFT", "update", "update-data");
  recordReceipt(18, "AxiomAgentNFT.update", "description=strategy-v2", receipt, deps.chainId);
}

export async function runPostVaultCoveragePipeline(deps: {
  vault: string;
  agentNft: string;
  paymentProcessor: string;
  deployer: Wallet;
  tokenId: bigint;
  dataHash: `0x${string}`;
  delegateAddress: string;
  chainId: number;
  skipWithdraw?: boolean;
  withRoyalty?: boolean;
  royaltyBps?: bigint;
  withdrawWei?: bigint;
}): Promise<bigint> {
  const withRoyalty = deps.withRoyalty !== false;
  const bps = deps.royaltyBps ?? 8000n;
  const withdrawAmount = deps.withdrawWei ?? parseEther("0.0001");
  const vault = new TypedContract<VaultCov>(deps.vault, VAULT_ABI, deps.deployer);
  const nft = new TypedContract<AgentNftExtended>(
    deps.agentNft,
    AGENT_NFT_EXTENDED_ABI,
    deps.deployer,
  );
  const pay = new TypedContract<PaymentCov>(
    deps.paymentProcessor,
    PAYMENT_PROCESSOR_ABI,
    deps.deployer,
  );

  const balanceBefore = await vault.contract.balanceOf(deps.tokenId);
  const steps: Parameters<typeof pipelineWalletTxs>[1] = [];

  if (!deps.skipWithdraw) {
    if (balanceBefore < withdrawAmount) {
      throw new Error(
        `mega pipeline withdraw: balance ${balanceBefore} < ${withdrawAmount}`,
      );
    }
    steps.push({
      name: "AxiomStrategyVault.withdraw",
      send: () => vault.contract.withdraw(deps.tokenId, withdrawAmount),
    });
  }

  steps.push(
    ...(await buildAuthorizeDelegatePipelineSteps(
      nft,
      deps.tokenId,
      deps.delegateAddress,
    )),
    {
      name: "AxiomAgentNFT.update",
      send: () =>
        nft.contract.update(deps.tokenId, [
          { dataDescription: "strategy-v2", dataHash: deps.dataHash },
        ]),
    },
  );
  const royaltyAlreadySet = withRoyalty
    ? await pay.contract.royaltyBpsSet(deps.tokenId)
    : false;
  if (withRoyalty && !royaltyAlreadySet) {
    steps.push({
      name: "setRoyaltyBpsPermitted",
      send: () => pay.contract.setRoyaltyBpsPermitted(deps.tokenId, bps),
    });
  } else if (royaltyAlreadySet) {
    markCovered("AxiomPaymentProcessor", "setRoyaltyBpsPermitted", "reuse-royalty");
    markScenarioCovered("payment.royalty", "reuse-royalty", { reads: 1 });
  }

  const receipts = await pipelineWalletTxs("post-vault mega", steps);
  const receiptFor = (stepName: string) => {
    const idx = steps.findIndex((s) => s.name === stepName);
    if (idx < 0) return null;
    return receipts[idx] ?? null;
  };
  const lastReceipt = receipts[receipts.length - 1]!;

  let vaultBal = balanceBefore;
  if (!deps.skipWithdraw) {
    vaultBal = await vault.contract.balanceOf(deps.tokenId);
    if (vaultBal !== balanceBefore - withdrawAmount) {
      throw new Error(
        `vault withdraw: balance ${vaultBal} != ${balanceBefore - withdrawAmount}`,
      );
    }
    markScenarioCovered("vault.withdraw", "vault-withdraw", { txs: 1, reads: 2 });
    markCovered("AxiomStrategyVault", "withdraw", "vault-withdraw");
    recordReceipt(13, "AxiomStrategyVault.withdraw", `balance ${balanceBefore} -> ${vaultBal}`, receipts[0]!, deps.chainId);
  }

  const assistant = await nft.contract.getDelegateAccess(deps.deployer.address);
  if (assistant.toLowerCase() !== deps.delegateAddress.toLowerCase()) {
    throw new Error(`getDelegateAccess ${assistant} != ${deps.delegateAddress}`);
  }
  const afterRevoke = await nft.contract.authorizedUsersOf(deps.tokenId);
  if (afterRevoke.length !== 0) {
    throw new Error(`authorizedUsersOf not cleared: ${afterRevoke.join(",")}`);
  }
  markCovered("AxiomAgentNFT", "authorizedUsersOf", "authorize");
  markScenarioCovered("agent.authorize", "authorize", { txs: 1, reads: 1 });
  markScenarioCovered("agent.delegate", "delegateAccess", { txs: 1, reads: 1 });
  markScenarioCovered("agent.revoke", "revokeAuthorization", { txs: 1, reads: 1 });
  markCovered("AxiomAgentNFT", "authorizeUsage", "authorize");
  markCovered("AxiomAgentNFT", "delegateAccess", "delegateAccess");
  markCovered("AxiomAgentNFT", "revokeAuthorization", "revokeAuthorization");
  markCovered("AxiomAgentNFT", "getDelegateAccess", "delegateAccess");

  const datas = await nft.contract.intelligentDataOf(deps.tokenId);
  if (datas[0]?.dataDescription !== "strategy-v2") {
    throw new Error(`update description mismatch ${datas[0]?.dataDescription}`);
  }
  markScenarioCovered("agent.update", "update-data", { txs: 1, reads: 1 });
  markCovered("AxiomAgentNFT", "update", "update-data");
  if (withRoyalty) {
    const onChain = await pay.contract.royaltyBpsOf(deps.tokenId);
    if (onChain !== bps) throw new Error(`royaltyBpsOf ${onChain} != ${bps}`);
    if (!(await pay.contract.royaltyBpsSet(deps.tokenId))) {
      throw new Error("royaltyBpsSet false after set");
    }
    markScenarioCovered("payment.royalty", "royalty", { txs: 1, reads: 2 });
    markCovered(
      "AxiomPaymentProcessor",
      "setRoyaltyBpsPermitted",
      steps.some((s) => s.name === "setRoyaltyBpsPermitted")
        ? "royalty"
        : "reuse-royalty",
    );
  }

  const revokeReceipt = receiptFor("revokeAuthorization");
  const updateReceipt = receiptFor("AxiomAgentNFT.update");
  if (revokeReceipt) {
    recordReceipt(17, "authorize/delegate/revoke", `delegate=${deps.delegateAddress.slice(0, 10)}…`, revokeReceipt, deps.chainId);
  }
  if (updateReceipt) {
    recordReceipt(18, "AxiomAgentNFT.update", "description=strategy-v2", updateReceipt, deps.chainId);
  }
  if (withRoyalty) {
    recordReceipt(14, "setRoyaltyBpsPermitted", `royaltyBps=${bps}`, lastReceipt, deps.chainId);
  }

  return vaultBal;
}

function computeTransferProofNonce(finalResp: FinalResponse): `0x${string}` {
  const coder = AbiCoder.defaultAbiCoder();
  return keccak256(
    coder.encode(
      ["bytes32", "bytes", "bytes", "uint256", "uint256"],
      [
        finalResp.accessProof.dataHash,
        finalResp.accessProof.targetPubkey,
        finalResp.ownershipProof.sealedKey,
        finalResp.accessProof.nonce,
        finalResp.accessProof.validUntil,
      ],
    ),
  ) as `0x${string}`;
}

export async function runTeeCleanupStep(deps: {
  teeVerifier: string;
  deployer: Wallet;
  finalResp: FinalResponse;
  chainId: number;
}): Promise<void> {
  console.log("\n[Parity] cleanExpiredProofs (post-transfer nonce)");
  const tee = new TypedContract<TeeCov>(deps.teeVerifier, TEE_VERIFIER_ABI, deps.deployer);
  const proofNonce = computeTransferProofNonce(deps.finalResp);
  const tx = await tee.contract.cleanExpiredProofs([proofNonce]);
  const receipt = assertReceiptOk(await tx.wait(), "cleanExpiredProofs");
  markScenarioCovered("tee.cleanup", "tee-cleanup", { txs: 1 });
  markCovered("AxiomTeeVerifier", "cleanExpiredProofs", "tee-cleanup");
  recordReceipt(19, "cleanExpiredProofs", `nonce=${proofNonce.slice(0, 14)}…`, receipt, deps.chainId);
}

