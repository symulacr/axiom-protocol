// PaymentProcessorClient — ethers v6 wrapper around AxiomPaymentProcessor.
//
// The contract is a standalone (non-upgradeable) ERC-20 payment splitter: it
// pulls the configured stable from the caller, credits the agent creator's
// withdrawable balance (royalty), and forwards the protocol cut to the treasury
// in the same atomic call. See apps/contracts/src/AxiomPaymentProcessor.sol.
//
// Write methods return the tx receipt (after 1 confirmation). Read methods
// return the decoded result. The constructor takes a signer for write paths
// and falls back to a provider for view-only clients.

import { type ContractTransactionReceipt, type Wallet, type JsonRpcProvider, type Log, type EventLog } from "ethers";
import { TypedContract } from "@axiom/config/types/contract";
import type { PaymentProcessorMethods, ERC20Methods } from "../contract-types.js";

// AxiomPaymentProcessor ABI — standalone, non-upgradeable contract.
// Source of truth: apps/contracts/src/AxiomPaymentProcessor.sol
// Deployed at 0x096203fB54681b66dD8ab9bA47aaB462aA8C4A5f (Galileo testnet).
//
// The contract pulls an ERC-20 stable (USDC.e / USDG) from the payer, credits
// the agent creator's withdrawable balance (royalty), and forwards the protocol
// cut to the treasury in the same call. See:
//   https://eips.ethereum.org/EIPS/eip-20 (ERC-20)
//   https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#SafeERC20

const PAYMENT_PROCESSOR_ABI: readonly string[] = [
  "function payForAgent(uint256 agentTokenId, uint256 amount)",
  "function payComputeProvider(address provider, uint256 amount)",
  "function withdrawAgentEarnings()",
  "function setRoyaltyBps(uint256 agentTokenId, uint256 bps)",
  "function protocolTreasury() view returns (address)",
  "function protocolFeeBps() view returns (uint256)",
  "function paymentToken() view returns (address)",
  "function royaltyBpsOf(uint256) view returns (uint256)",
  "function royaltyBpsSet(uint256) view returns (bool)",
  "function agentEarningsOf(address) view returns (uint256)",
  "event PaymentProcessed(uint256 indexed agentTokenId, address indexed payer, address indexed creator, uint256 amount, uint256 creatorCut, uint256 protocolCut)",
  "event ComputeProviderPaid(address indexed provider, uint256 amount)",
  "event EarningsWithdrawn(address indexed creator, uint256 amount)",
  "event RoyaltySet(uint256 indexed agentTokenId, uint256 bps)",
] as const;

// Minimal ERC-20 ABI for the approval pre-flight. The PaymentProcessor pulls
// the full amount from the caller via safeTransferFrom, so the backend signer
// must have granted sufficient allowance to the processor before payForAgent /
// payComputeProvider will succeed.
const ERC20_ABI: readonly string[] = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
] as const;

export interface PaymentConfig {
  /** AxiomPaymentProcessor proxy address. */
  readonly address: string;
  /** Signer for write paths (payForAgent, payComputeProvider, withdraw, setRoyalty). */
  readonly signer: Wallet;
  /** Provider for read-only clients / view calls. */
  readonly provider: JsonRpcProvider;
  /** ERC-20 payment token (USDC.e / USDG). Required for approval pre-flight. */
  readonly paymentTokenAddress: string;
}

export interface PaymentProcessedEvent {
  readonly agentTokenId: bigint;
  readonly payer: string;
  readonly creator: string;
  readonly amount: bigint;
  readonly creatorCut: bigint;
  readonly protocolCut: bigint;
}

/**
 * Thin wrapper over the AxiomPaymentProcessor contract. Each write method
 * waits for one confirmation and returns the receipt; read methods return the
 * decoded result. The class never caches state — every call hits the chain.
 */
export class PaymentProcessorClient {
  readonly address: string;
  readonly paymentTokenAddress: string;
  private readonly payment: TypedContract<PaymentProcessorMethods>;
  private readonly token: TypedContract<ERC20Methods>;
  private readonly signer: Wallet;

  constructor(cfg: PaymentConfig) {
    this.address = cfg.address;
    this.paymentTokenAddress = cfg.paymentTokenAddress;
    this.signer = cfg.signer;
    this.payment = new TypedContract<PaymentProcessorMethods>(cfg.address, PAYMENT_PROCESSOR_ABI, cfg.signer);
    this.token = new TypedContract<ERC20Methods>(cfg.paymentTokenAddress, ERC20_ABI, cfg.signer);
  }

  // ─── Write paths ──────────────────────────────────────────────

  /**
   * Pay for an agent's service. Pulls `amount` of the payment token from the
   * backend signer (must have approved the processor) and splits it between
   * the creator (credited, pull via withdrawEarnings) and the treasury.
   *
   * Pre-flight: if the current allowance is below `amount`, approve the
   * processor for `amount` first. This keeps the route self-contained for
   * operator-driven flows (the signer is the protocol operator).
   */
  async payForAgent(agentTokenId: bigint, amount: bigint): Promise<{ receipt: ContractTransactionReceipt; event: PaymentProcessedEvent | null }> {
    await this.ensureAllowance(amount);
    const tx = await this.payment.contract.payForAgent(agentTokenId, amount);
    const receipt = (await tx.wait()) as ContractTransactionReceipt;
    const event = this.parsePaymentProcessed(receipt);
    return { receipt, event };
  }

  /**
   * Protocol-level compute provider payout. Pulls `amount` from the backend
   * signer and forwards the full amount to `provider`.
   */
  async payComputeProvider(provider: string, amount: bigint): Promise<{ receipt: ContractTransactionReceipt; provider: string; amount: bigint }> {
    await this.ensureAllowance(amount);
    const tx = await this.payment.contract.payComputeProvider(provider, amount);
    const receipt = (await tx.wait()) as ContractTransactionReceipt;
    return { receipt, provider, amount };
  }

  /**
   * Withdraw the backend signer's accumulated creator earnings. Only meaningful
   * when the signer is itself an agent creator.
   */
  async withdrawEarnings(): Promise<{ receipt: ContractTransactionReceipt; amount: bigint | null }> {
    const tx = await this.payment.contract.withdrawAgentEarnings();
    const receipt = (await tx.wait()) as ContractTransactionReceipt;
    const topic = this.payment.iface.getEvent("EarningsWithdrawn")?.topicHash;
    const log = topic ? receipt.logs.find((l: Log | EventLog) => l.topics[0] === topic) : undefined;
    let amount: bigint | null = null;
    if (log) {
      const parsed = this.payment.iface.parseLog(log as unknown as { topics: string[]; data: string });
      amount = (parsed?.args.amount as bigint) ?? null;
    }
    return { receipt, amount };
  }

  /**
   * Set the per-agent royalty override (basis points). Only the agent creator
   * may call this on-chain; the backend signer must be the creator for the tx
   * to succeed.
   */
  async setRoyalty(agentTokenId: bigint, bps: number): Promise<ContractTransactionReceipt> {
    const tx = await this.payment.contract.setRoyaltyBps(agentTokenId, bps);
    return (await tx.wait()) as ContractTransactionReceipt;
  }

  // ─── Read paths ───────────────────────────────────────────────

  async earningsOf(creator: string): Promise<bigint> {
    return await this.payment.contract.agentEarningsOf(creator);
  }

  async royaltyBpsOf(agentTokenId: bigint): Promise<bigint> {
    return await this.payment.contract.royaltyBpsOf(agentTokenId);
  }

  async royaltyBpsSet(agentTokenId: bigint): Promise<boolean> {
    return await this.payment.contract.royaltyBpsSet(agentTokenId);
  }

  async protocolFeeBps(): Promise<bigint> {
    return await this.payment.contract.protocolFeeBps();
  }

  async protocolTreasury(): Promise<string> {
    return await this.payment.contract.protocolTreasury();
  }

  async paymentToken(): Promise<string> {
    return await this.payment.contract.paymentToken();
  }

  // ─── Internals ────────────────────────────────────────────────

  /**
   * Grant the processor an allowance covering `amount` if the current
   * allowance is insufficient. Uses a single approve call rather than
   * bumping, since the signer is the operator and approvals are cheap.
   * Ref: https://eips.ethereum.org/EIPS/eip-20 (approve).
   */
  private async ensureAllowance(amount: bigint): Promise<void> {
    const current = await this.token.contract.allowance(this.signer.address, this.address);
    if (current >= amount) return;
    const tx = await this.token.contract.approve(this.address, amount);
    await tx.wait();
  }

  private parsePaymentProcessed(receipt: ContractTransactionReceipt): PaymentProcessedEvent | null {
    const topic = this.payment.iface.getEvent("PaymentProcessed")?.topicHash;
    const log = topic ? receipt.logs.find((l: Log | EventLog) => l.topics[0] === topic) : undefined;
    if (!log) return null;
    const parsed = this.payment.iface.parseLog(log as unknown as { topics: string[]; data: string });
    if (!parsed) return null;
    const args = parsed.args as unknown as {
      agentTokenId: bigint;
      payer: string;
      creator: string;
      amount: bigint;
      creatorCut: bigint;
      protocolCut: bigint;
    };
    return {
      agentTokenId: args.agentTokenId,
      payer: args.payer,
      creator: args.creator,
      amount: args.amount,
      creatorCut: args.creatorCut,
      protocolCut: args.protocolCut,
    };
  }
}
