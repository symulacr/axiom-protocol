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
import { assertReceiptOk, recordOnChainStep } from "./onchain.js";
import { markCovered } from "./matrix.js";
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

  const name = await nft.contract.name();
  const symbol = await nft.contract.symbol();
  const uri = await nft.contract.tokenURI(deps.tokenId);
  if (!uri.startsWith("data:application/json")) {
    throw new Error(`tokenURI unexpected format: ${uri.slice(0, 40)}…`);
  }
  const storageInfo = await nft.contract.storageInfo();
  const verifierAddr = await nft.contract.verifier();
  if (verifierAddr.toLowerCase() !== deps.teeVerifier.toLowerCase()) {
    throw new Error(`verifier mismatch ${verifierAddr} != ${deps.teeVerifier}`);
  }
  await nft.contract.pendingVerifier();
  await nft.contract.pendingVerifierExecutableAt();
  const dataSingular = await nft.contract.intelligentDataOf(deps.tokenId);
  if (dataSingular.length === 0) throw new Error("intelligentDataOf empty");

  const supportsErc165 = await nft.contract.supportsInterface(ERC165_INTERFACE_ID);
  const supportsErc721 = await nft.contract.supportsInterface(ERC721_INTERFACE_ID);
  if (!supportsErc165 || !supportsErc721) {
    throw new Error(
      `supportsInterface failed erc165=${supportsErc165} erc721=${supportsErc721}`,
    );
  }

  await vault.contract.balanceOf(deps.tokenId);
  markCovered("AxiomStrategyVault", "balanceOf", "view-sweep");

  const treasury = await pay.contract.protocolTreasury();
  await pay.contract.pendingProtocolTreasury();
  await pay.contract.pendingTreasuryEffectiveAt();
  await pay.contract.protocolFeeBps();
  const payToken = await pay.contract.paymentToken();
  if (payToken.toLowerCase() !== deps.paymentToken.toLowerCase()) {
    throw new Error(`paymentToken mismatch ${payToken}`);
  }
  await pay.contract.totalOutstandingEarnings();
  await pay.contract.royaltyBpsOf(deps.tokenId);
  await pay.contract.royaltyBpsSet(deps.tokenId);
  await pay.contract.agentEarningsOf(deps.deployer.address);

  const domain = await tee.contract.domainSeparator();
  const signer = await tee.contract.registeredSigner();
  if (signer.toLowerCase() !== deps.teeSignerAddress.toLowerCase()) {
    throw new Error(`registeredSigner ${signer} != oracle ${deps.teeSignerAddress}`);
  }
  await tee.contract.maxProofAgeSeconds();
  await tee.contract.owner();
  await tee.contract.ADMIN_DELAY();

  await token.contract.balanceOf(deps.deployer.address);

  const marks: Array<[string, string]> = [
    ["AxiomAgentNFT", "name"],
    ["AxiomAgentNFT", "symbol"],
    ["AxiomAgentNFT", "tokenURI"],
    ["AxiomAgentNFT", "storageInfo"],
    ["AxiomAgentNFT", "verifier"],
    ["AxiomAgentNFT", "pendingVerifier"],
    ["AxiomAgentNFT", "pendingVerifierExecutableAt"],
    ["AxiomAgentNFT", "intelligentDataOf"],
    ["AxiomAgentNFT", "supportsInterface"],
    ["AxiomPaymentProcessor", "protocolTreasury"],
    ["AxiomPaymentProcessor", "pendingProtocolTreasury"],
    ["AxiomPaymentProcessor", "pendingTreasuryEffectiveAt"],
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
    ["AxiomTeeVerifier", "ADMIN_DELAY"],
    ["MockUSDC", "balanceOf"],
  ];
  for (const [c, f] of marks) markCovered(c, f, "view-sweep");

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
  markCovered("AxiomStrategyVault", "withdraw", "vault-withdraw");
  recordOnChainStep({
    step: 13,
    name: "AxiomStrategyVault.withdraw",
    ok: true,
    summary: `balance ${before} -> ${after}`,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    chainId: deps.chainId,
  });
  return after;
}

export async function runRoyaltyStep(deps: {
  paymentProcessor: string;
  deployer: Wallet;
  tokenId: bigint;
  chainId: number;
  royaltyBps?: bigint;
}): Promise<void> {
  const bps = deps.royaltyBps ?? 8000n;
  console.log(`\n[Parity] setRoyaltyBpsPermitted bps=${bps} tokenId=${deps.tokenId}`);
  const pay = new TypedContract<PaymentCov>(
    deps.paymentProcessor,
    PAYMENT_PROCESSOR_ABI,
    deps.deployer,
  );
  const tx = await pay.contract.setRoyaltyBpsPermitted(deps.tokenId, bps);
  const receipt = assertReceiptOk(await tx.wait(), "setRoyaltyBpsPermitted");
  const onChain = await pay.contract.royaltyBpsOf(deps.tokenId);
  if (onChain !== bps) throw new Error(`royaltyBpsOf ${onChain} != ${bps}`);
  if (!(await pay.contract.royaltyBpsSet(deps.tokenId))) {
    throw new Error("royaltyBpsSet false after set");
  }
  markCovered("AxiomPaymentProcessor", "setRoyaltyBpsPermitted", "royalty");
  recordOnChainStep({
    step: 14,
    name: "setRoyaltyBpsPermitted",
    ok: true,
    summary: `royaltyBps=${onChain}`,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    chainId: deps.chainId,
  });
}

export async function runPayComputeProviderStep(deps: {
  paymentProcessor: string;
  paymentToken: string;
  deployer: Wallet;
  provider: string;
  chainId: number;
  amount?: bigint;
}): Promise<void> {
  const amount = deps.amount ?? parseUnits("0.5", 6);
  console.log(`\n[Parity] payComputeProvider provider=${deps.provider} amount=${amount}`);
  const token = new TypedContract<Erc20Cov>(deps.paymentToken, ERC20_ABI, deps.deployer);
  const pay = new TypedContract<PaymentCov>(
    deps.paymentProcessor,
    PAYMENT_PROCESSOR_ABI,
    deps.deployer,
  );
  const balBefore = await token.contract.balanceOf(deps.provider);
  const balance = await token.contract.balanceOf(deps.deployer.address);
  if (balance < amount) throw new Error("insufficient token for payComputeProvider");
  const allowance = await token.contract.allowance(
    deps.deployer.address,
    deps.paymentProcessor,
  );
  if (allowance < amount) {
    const approveTx = await token.contract.approve(deps.paymentProcessor, amount);
    assertReceiptOk(await approveTx.wait(), "approve compute");
    markCovered("MockUSDC", "approve", "payComputeProvider");
  }
  markCovered("MockUSDC", "allowance", "payComputeProvider");
  const tx = await pay.contract.payComputeProvider(deps.provider, amount);
  const receipt = assertReceiptOk(await tx.wait(), "payComputeProvider");
  const balAfter = await token.contract.balanceOf(deps.provider);
  if (balAfter < balBefore + amount) {
    throw new Error(`provider balance did not increase by ${amount}`);
  }
  markCovered("AxiomPaymentProcessor", "payComputeProvider", "payComputeProvider");
  markCovered("MockUSDC", "transfer", "payComputeProvider");
  recordOnChainStep({
    step: 15,
    name: "payComputeProvider",
    ok: true,
    summary: `provider +${balAfter - balBefore}`,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    chainId: deps.chainId,
  });
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
  markCovered("AxiomPaymentProcessor", "withdrawAgentEarnings", "withdrawEarnings");
  recordOnChainStep({
    step: 16,
    name: "withdrawAgentEarnings",
    ok: true,
    summary: `withdrew ${pending}`,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    chainId: deps.chainId,
  });
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
  const authTx = await nft.contract.authorizeUsage(deps.tokenId, deps.delegateAddress);
  const authReceipt = assertReceiptOk(await authTx.wait(), "authorizeUsage");
  const users = await nft.contract.authorizedUsersOf(deps.tokenId);
  if (!users.map((a) => a.toLowerCase()).includes(deps.delegateAddress.toLowerCase())) {
    throw new Error("authorizedUsersOf missing delegate");
  }
  markCovered("AxiomAgentNFT", "authorizeUsage", "authorize");
  markCovered("AxiomAgentNFT", "authorizedUsersOf", "authorize");

  const delTx = await nft.contract.delegateAccess(deps.delegateAddress);
  const delReceipt = assertReceiptOk(await delTx.wait(), "delegateAccess");
  const assistant = await nft.contract.getDelegateAccess(deps.deployer.address);
  if (assistant.toLowerCase() !== deps.delegateAddress.toLowerCase()) {
    throw new Error(`getDelegateAccess ${assistant} != ${deps.delegateAddress}`);
  }
  markCovered("AxiomAgentNFT", "delegateAccess", "delegateAccess");
  markCovered("AxiomAgentNFT", "getDelegateAccess", "delegateAccess");

  const revTx = await nft.contract.revokeAuthorization(deps.tokenId, deps.delegateAddress);
  const revReceipt = assertReceiptOk(await revTx.wait(), "revokeAuthorization");
  const afterRevoke = await nft.contract.authorizedUsersOf(deps.tokenId);
  if (afterRevoke.length !== 0) {
    throw new Error(`authorizedUsersOf not cleared after revoke: ${afterRevoke.join(",")}`);
  }
  markCovered("AxiomAgentNFT", "revokeAuthorization", "revokeAuthorization");

  recordOnChainStep({
    step: 17,
    name: "authorize/delegate/revoke",
    ok: true,
    summary: `delegate=${deps.delegateAddress.slice(0, 10)}…`,
    txHash: revReceipt.hash,
    blockNumber: revReceipt.blockNumber,
    chainId: deps.chainId,
  });
  void authReceipt;
  void delReceipt;
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
  markCovered("AxiomAgentNFT", "update", "update-data");
  recordOnChainStep({
    step: 18,
    name: "AxiomAgentNFT.update",
    ok: true,
    summary: "description=strategy-v2",
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    chainId: deps.chainId,
  });
}

/** Recompute the proof nonce the verifier marks on iTransfer (matches AxiomTeeVerifier.sol). */
export function computeTransferProofNonce(finalResp: FinalResponse): `0x${string}` {
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
  markCovered("AxiomTeeVerifier", "cleanExpiredProofs", "tee-cleanup");
  recordOnChainStep({
    step: 19,
    name: "cleanExpiredProofs",
    ok: true,
    summary: `nonce=${proofNonce.slice(0, 14)}…`,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    chainId: deps.chainId,
  });
}

