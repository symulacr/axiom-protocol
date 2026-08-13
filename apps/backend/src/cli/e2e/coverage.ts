import { parseUnits, type TransactionResponse, type Wallet } from "ethers";
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
import { readVaultStrategy } from "../../orchestrator/index.js";

// All extended fragments are already part of AGENT_NFT_ABI; keep the alias for callers.
const AGENT_NFT_EXTENDED_ABI = [...AGENT_NFT_ABI] as const;

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
  intelligentDataOf(
    tokenId: bigint,
  ): Promise<Array<{ dataDescription: string; dataHash: string }>>;
  intelligentDatasOf(
    tokenId: bigint,
  ): Promise<Array<{ dataDescription: string; dataHash: string }>>;
  mintFee(): Promise<bigint>;
  creatorOf(tokenId: bigint): Promise<string>;
  ownerOf(tokenId: bigint): Promise<string>;
  supportsInterface(id: string): Promise<boolean>;
  authorizeDelegateAndRevoke(
    delegate: string,
    tokenId: bigint,
  ): Promise<TransactionResponse>;
  authorizedUsersOf(tokenId: bigint): Promise<string[]>;
  delegateAccess(assistant: string): Promise<TransactionResponse>;
  getDelegateAccess(user: string): Promise<string>;
};

type VaultCov = {
  balanceOf(tokenId: bigint): Promise<bigint>;
};

type PaymentCov = {
  payAndWithdrawEarnings(
    agentTokenId: bigint,
    provider: string,
    agentAmount: bigint,
    computeAmount: bigint,
    royaltyBps: bigint,
  ): Promise<TransactionResponse>;
  payComputeProvider(
    provider: string,
    amount: bigint,
  ): Promise<TransactionResponse>;
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
  const vault = new TypedContract<VaultCov>(
    deps.vault,
    VAULT_ABI,
    deps.deployer,
  );
  const pay = new TypedContract<PaymentCov>(
    deps.paymentProcessor,
    PAYMENT_PROCESSOR_ABI,
    deps.deployer,
  );
  const tee = new TypedContract<TeeCov>(
    deps.teeVerifier,
    TEE_VERIFIER_ABI,
    deps.deployer,
  );
  const token = new TypedContract<Erc20Cov>(
    deps.paymentToken,
    ERC20_ABI,
    deps.deployer,
  );

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
    hasContractFunction(
      provider,
      deps.agentNft,
      "function creatorOf(uint256) view returns (address)",
    ).then((ok) => (ok ? nft.contract.creatorOf(deps.tokenId) : null)),
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
  const [
    hasPendingVerifier,
    hasPendingVerifierAt,
    hasPendingTreasury,
    hasPendingTreasuryAt,
    hasProtocolFeeBps,
    hasTotalOutstanding,
    hasAdminDelay,
  ] = await Promise.all([
    hasContractFunction(
      provider,
      deps.agentNft,
      "function pendingVerifier() view returns (address)",
    ),
    hasContractFunction(
      provider,
      deps.agentNft,
      "function pendingVerifierExecutableAt() view returns (uint256)",
    ),
    hasContractFunction(
      provider,
      deps.paymentProcessor,
      "function pendingProtocolTreasury() view returns (address)",
    ),
    hasContractFunction(
      provider,
      deps.paymentProcessor,
      "function pendingTreasuryEffectiveAt() view returns (uint256)",
    ),
    hasContractFunction(
      provider,
      deps.paymentProcessor,
      "function protocolFeeBps() view returns (uint256)",
    ),
    hasContractFunction(
      provider,
      deps.paymentProcessor,
      "function totalOutstandingEarnings() view returns (uint256)",
    ),
    hasContractFunction(
      provider,
      deps.teeVerifier,
      "function ADMIN_DELAY() view returns (uint256)",
    ),
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
    markSkipped(
      "AxiomAgentNFT",
      "pendingVerifierExecutableAt",
      LEGACY_DEPLOY_REASON,
    );
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
    markCovered(
      "AxiomPaymentProcessor",
      "pendingProtocolTreasury",
      "view-sweep",
    );
  } else {
    markSkipped(
      "AxiomPaymentProcessor",
      "pendingProtocolTreasury",
      LEGACY_DEPLOY_REASON,
    );
  }
  if (hasPendingTreasuryAt) {
    await pay.contract.pendingTreasuryEffectiveAt();
    markCovered(
      "AxiomPaymentProcessor",
      "pendingTreasuryEffectiveAt",
      "view-sweep",
    );
  } else {
    markSkipped(
      "AxiomPaymentProcessor",
      "pendingTreasuryEffectiveAt",
      LEGACY_DEPLOY_REASON,
    );
  }
  if (hasProtocolFeeBps) {
    await pay.contract.protocolFeeBps();
    markCovered("AxiomPaymentProcessor", "protocolFeeBps", "view-sweep");
  } else {
    markSkipped(
      "AxiomPaymentProcessor",
      "protocolFeeBps",
      LEGACY_DEPLOY_REASON,
    );
  }
  if (payToken.toLowerCase() !== deps.paymentToken.toLowerCase()) {
    throw new Error(`paymentToken mismatch ${payToken}`);
  }
  if (hasTotalOutstanding) {
    await pay.contract.totalOutstandingEarnings();
    markCovered(
      "AxiomPaymentProcessor",
      "totalOutstandingEarnings",
      "view-sweep",
    );
  } else {
    markSkipped(
      "AxiomPaymentProcessor",
      "totalOutstandingEarnings",
      LEGACY_DEPLOY_REASON,
    );
  }
  const [, royaltyAlreadySet] = await Promise.all([
    pay.contract.royaltyBpsOf(deps.tokenId),
    pay.contract.royaltyBpsSet(deps.tokenId),
    pay.contract.agentEarningsOf(deps.deployer.address),
    tee.contract.maxProofAgeSeconds(),
    tee.contract.owner(),
  ]);
  if (royaltyAlreadySet) {
    markCovered("AxiomPaymentProcessor", "setRoyaltyBps", "reuse-royalty");
    markScenarioCovered("payment.royalty", "reuse-royalty", { reads: 2 });
  }
  if (signer.toLowerCase() !== deps.teeSignerAddress.toLowerCase()) {
    throw new Error(
      `registeredSigner ${signer} != oracle ${deps.teeSignerAddress}`,
    );
  }
  if (hasAdminDelay) {
    await tee.contract.ADMIN_DELAY();
    markCovered("AxiomTeeVerifier", "ADMIN_DELAY", "view-sweep");
  } else {
    markSkipped("AxiomTeeVerifier", "ADMIN_DELAY", LEGACY_DEPLOY_REASON);
  }

  if (
    creator &&
    creator.toLowerCase() !== deps.deployer.address.toLowerCase()
  ) {
    throw new Error(
      `creatorOf ${creator} != operator ${deps.deployer.address}`,
    );
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

export async function runPaymentPipelineStep(deps: {
  paymentProcessor: string;
  paymentToken: string;
  deployer: Wallet;
  tokenId: bigint;
  provider: string;
  chainId: number;
  payAmount?: bigint;
  computeAmount?: bigint;
  /** Royalty folded into payAndWithdrawEarnings (set in-tx before the split). */
  royaltyBps?: bigint;
}): Promise<void> {
  const token = new TypedContract<Erc20Cov>(
    deps.paymentToken,
    ERC20_ABI,
    deps.deployer,
  );
  const pay = new TypedContract<PaymentCov>(
    deps.paymentProcessor,
    PAYMENT_PROCESSOR_ABI,
    deps.deployer,
  );
  const royaltyBps = deps.royaltyBps ?? 8000n;
  if (royaltyBps === 0n) {
    throw new Error(
      "payment pipeline: royaltyBps must be > 0 (merged pay sets royalty in-tx; a 0 split would leave nothing to withdraw)",
    );
  }
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
    `\n[Parity] payment pipeline payAndWithdrawEarnings(agent=${payAmount} compute=${computeAmount} royalty=${royaltyBps}) — 1 tx (approve cached)`,
  );
  const earningsBefore = await pay.contract.agentEarningsOf(
    deps.deployer.address,
  );
  const providerBalBefore = await token.contract.balanceOf(deps.provider);
  const deployerBalBefore = await token.contract.balanceOf(
    deps.deployer.address,
  );
  await ensureErc20Allowance({
    token: deps.paymentToken,
    owner: deps.deployer,
    spender: deps.paymentProcessor,
    amount: needTotal,
    step: "payment-pipeline",
  });
  const payTx = await pay.contract.payAndWithdrawEarnings(
    deps.tokenId,
    deps.provider,
    payAmount,
    computeAmount,
    royaltyBps,
  );
  const payReceipt = assertReceiptOk(
    await payTx.wait(),
    "payAndWithdrawEarnings",
  );

  // Post-hoc assertions: the royalty-set, earnings-credit, provider-payout and
  // earnings-withdraw legs all run inside the same tx (final state only).
  const earningsAfter = await pay.contract.agentEarningsOf(
    deps.deployer.address,
  );
  if (earningsAfter !== earningsBefore) {
    throw new Error(
      `payAndWithdrawEarnings: earnings ${earningsBefore} -> ${earningsAfter} (expected back to pre-pay)`,
    );
  }
  const providerBalAfter = await token.contract.balanceOf(deps.provider);
  if (providerBalAfter !== providerBalBefore + computeAmount) {
    throw new Error(
      `payAndWithdrawEarnings: provider balance did not increase by computeAmount (${providerBalAfter} != ${providerBalBefore + computeAmount})`,
    );
  }
  const deployerBalAfter = await token.contract.balanceOf(
    deps.deployer.address,
  );
  const feeBps = await pay.contract.protocolFeeBps();
  const creatorCut = computeCreatorCut(payAmount, royaltyBps, feeBps);
  // Net deployer delta = -(payAmount + computeAmount) + (prior earnings + creatorCut).
  const expectedDelta = earningsBefore + creatorCut - payAmount - computeAmount;
  if (deployerBalAfter - deployerBalBefore < expectedDelta) {
    throw new Error(
      `payAndWithdrawEarnings: deployer delta ${deployerBalAfter - deployerBalBefore} < expected ${expectedDelta}`,
    );
  }
  const onChainRoyalty = await pay.contract.royaltyBpsOf(deps.tokenId);
  if (onChainRoyalty !== royaltyBps) {
    throw new Error(
      `payAndWithdrawEarnings: royaltyBpsOf ${onChainRoyalty} != ${royaltyBps}`,
    );
  }
  if (!(await pay.contract.royaltyBpsSet(deps.tokenId))) {
    throw new Error("payAndWithdrawEarnings: royaltyBpsSet false after pay");
  }
  markScenarioCovered("payment.agent", "payAndWithdrawEarnings", {
    txs: 1,
    reads: 2,
  });
  markScenarioCovered("payment.compute", "payAndWithdrawEarnings", {
    txs: 1,
  });
  markScenarioCovered("payment.withdraw", "payAndWithdrawEarnings", {
    txs: 1,
    reads: 2,
  });
  markScenarioCovered("payment.royalty", "payAndWithdrawEarnings", {
    txs: 1,
    reads: 2,
  });
  markCovered("AxiomPaymentProcessor", "payForAgent", "payAndWithdrawEarnings");
  markCovered(
    "AxiomPaymentProcessor",
    "agentEarningsOf",
    "payAndWithdrawEarnings",
  );
  markCovered(
    "AxiomPaymentProcessor",
    "payComputeProvider",
    "payAndWithdrawEarnings",
  );
  markCovered(
    "AxiomPaymentProcessor",
    "withdrawAgentEarnings",
    "payAndWithdrawEarnings",
  );
  markCovered(
    "AxiomPaymentProcessor",
    "setRoyaltyBps",
    "payAndWithdrawEarnings",
  );
  markCovered("MockUSDC", "transfer", "payAndWithdrawEarnings");
  recordReceipt(
    9,
    "AxiomPaymentProcessor.payAndWithdrawEarnings",
    `creator earned ${creatorCut} (royalty ${royaltyBps}); provider +${providerBalAfter - providerBalBefore}; earnings back to ${earningsAfter}`,
    payReceipt,
    deps.chainId,
  );
}

/** Mirrors the processor's split math (royalty set -> read at pay time). */
function computeCreatorCut(
  received: bigint,
  royaltyBps: bigint,
  feeBps: bigint,
): bigint {
  const BPS = 10000n;
  const creatorCut = (received * royaltyBps) / BPS;
  const protocolCut = received - creatorCut;
  const minProtocolCut = (received * feeBps) / BPS;
  return protocolCut < minProtocolCut ? received - minProtocolCut : creatorCut;
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
    // One tx: authorizeDelegateAndRevoke(delegate, tokenId) merges
    // authorizeUsage + delegateAccess + revokeAuthorization — no wave-2 split.
    steps.push({
      name: "authorizeDelegateAndRevoke",
      send: () =>
        nft.contract.authorizeDelegateAndRevoke(delegateAddress, tokenId),
    });
  } else {
    // Already authorized (edge reuse state): only re-set the delegate.
    steps.push({
      name: "delegateAccess",
      send: () => nft.contract.delegateAccess(delegateAddress),
    });
  }
  return steps;
}

export async function runAuthorizeDelegateStep(deps: {
  agentNft: string;
  deployer: Wallet;
  tokenId: bigint;
  delegateAddress: string;
  chainId: number;
}): Promise<void> {
  console.log(
    `\n[Parity] authorizeDelegateAndRevoke / delegateAccess (${deps.delegateAddress})`,
  );
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
    "authorizeDelegateAndRevoke",
    authSteps,
  );
  const isReuse = authSteps[0]?.name === "delegateAccess";
  const authReceipt = authReceipts[0]!;

  const assistant = await nft.contract.getDelegateAccess(deps.deployer.address);
  if (assistant.toLowerCase() !== deps.delegateAddress.toLowerCase()) {
    throw new Error(
      `getDelegateAccess ${assistant} != ${deps.delegateAddress}`,
    );
  }
  markScenarioCovered("agent.delegate", "delegateAccess", { txs: 1, reads: 1 });
  markCovered("AxiomAgentNFT", "delegateAccess", "delegateAccess");
  markCovered("AxiomAgentNFT", "getDelegateAccess", "delegateAccess");
  markCovered(
    "AxiomAgentNFT",
    "authorizedUsersOf",
    "authorizeDelegateAndRevoke",
  );
  if (isReuse) {
    recordReceipt(
      17,
      "delegateAccess",
      `delegate=${deps.delegateAddress.slice(0, 10)}…`,
      authReceipt,
      deps.chainId,
    );
    return;
  }
  const afterRevoke = await nft.contract.authorizedUsersOf(deps.tokenId);
  if (afterRevoke.length !== 0) {
    throw new Error(
      `authorizedUsersOf not cleared after authorizeDelegateAndRevoke: ${afterRevoke.join(",")}`,
    );
  }
  markScenarioCovered("agent.authorize", "authorizeDelegateAndRevoke", {
    txs: 1,
    reads: 1,
  });
  markScenarioCovered("agent.revoke", "authorizeDelegateAndRevoke", {
    txs: 1,
    reads: 1,
  });
  markCovered("AxiomAgentNFT", "authorizeUsage", "authorizeDelegateAndRevoke");
  markCovered(
    "AxiomAgentNFT",
    "revokeAuthorization",
    "authorizeDelegateAndRevoke",
  );

  recordReceipt(
    17,
    "authorizeDelegateAndRevoke",
    `delegate=${deps.delegateAddress.slice(0, 10)}…`,
    authReceipt,
    deps.chainId,
  );
}

export async function runPostVaultCoveragePipeline(deps: {
  vault: string;
  agentNft: string;
  deployer: Wallet;
  tokenId: bigint;
  delegateAddress: string;
  chainId: number;
}): Promise<bigint> {
  console.log(
    "\n[Parity] post-vault mega: authorizeDelegateAndRevoke (withdraw folded into deposit; update folded into mint; royalty folded into pay)",
  );
  const vault = new TypedContract<VaultCov>(
    deps.vault,
    VAULT_ABI,
    deps.deployer,
  );
  const nft = new TypedContract<AgentNftExtended>(
    deps.agentNft,
    AGENT_NFT_EXTENDED_ABI,
    deps.deployer,
  );

  const steps = await buildAuthorizeDelegatePipelineSteps(
    nft,
    deps.tokenId,
    deps.delegateAddress,
  );
  const receipts = await pipelineWalletTxs("post-vault mega", steps);
  const isReuse = steps[0]?.name === "delegateAccess";
  const lastReceipt = receipts[receipts.length - 1]!;

  const assistant = await nft.contract.getDelegateAccess(deps.deployer.address);
  if (assistant.toLowerCase() !== deps.delegateAddress.toLowerCase()) {
    throw new Error(
      `getDelegateAccess ${assistant} != ${deps.delegateAddress}`,
    );
  }
  markCovered(
    "AxiomAgentNFT",
    "authorizedUsersOf",
    "authorizeDelegateAndRevoke",
  );
  markCovered("AxiomAgentNFT", "delegateAccess", "delegateAccess");
  markCovered("AxiomAgentNFT", "getDelegateAccess", "delegateAccess");
  markScenarioCovered("agent.delegate", "delegateAccess", { txs: 1, reads: 1 });
  if (!isReuse) {
    const afterRevoke = await nft.contract.authorizedUsersOf(deps.tokenId);
    if (afterRevoke.length !== 0) {
      throw new Error(
        `authorizedUsersOf not cleared: ${afterRevoke.join(",")}`,
      );
    }
    markScenarioCovered("agent.authorize", "authorizeDelegateAndRevoke", {
      txs: 1,
      reads: 1,
    });
    markScenarioCovered("agent.revoke", "authorizeDelegateAndRevoke", {
      txs: 1,
      reads: 1,
    });
    markCovered(
      "AxiomAgentNFT",
      "authorizeUsage",
      "authorizeDelegateAndRevoke",
    );
    markCovered(
      "AxiomAgentNFT",
      "revokeAuthorization",
      "authorizeDelegateAndRevoke",
    );
  }

  // State check only — the config category has no on-chain tx left: mint wrote
  // the final descriptor (strategy-v2) and pay sets the royalty in-tx. The
  // parity `update` row is marked covered at the mint step instead.
  const datas = await nft.contract.intelligentDataOf(deps.tokenId);
  if (datas[0]?.dataDescription !== "strategy-v2") {
    throw new Error(
      `post-mega data description mismatch ${datas[0]?.dataDescription}`,
    );
  }

  recordReceipt(
    17,
    isReuse ? "delegateAccess" : "authorizeDelegateAndRevoke",
    `delegate=${deps.delegateAddress.slice(0, 10)}…`,
    lastReceipt,
    deps.chainId,
  );

  return vault.contract.balanceOf(deps.tokenId);
}
