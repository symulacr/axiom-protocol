// ethers v6 wrapper around AxiomPaymentProcessor.

import { type ContractTransactionReceipt, type TransactionResponse, type Wallet, type JsonRpcProvider, type Log, type EventLog } from "ethers";
import { TypedContract } from "@axiom/config/types/contract";
import { PAYMENT_PROCESSOR_ABI, ERC20_ABI } from "@axiom/config/abis";

// Local contract method types derived from the ABIs above (avoid shared contract-types.ts drift).
type PaymentProcessorMethods = {
  payForAgent(agentTokenId: bigint, amount: bigint): Promise<TransactionResponse>;
  payComputeProvider(provider: string, amount: bigint): Promise<TransactionResponse>;
  withdrawAgentEarnings(): Promise<TransactionResponse>;
  setRoyaltyBpsPermitted(agentTokenId: bigint, bps: number): Promise<TransactionResponse>;
  protocolTreasury(): Promise<string>;
  protocolFeeBps(): Promise<bigint>;
  paymentToken(): Promise<string>;
  royaltyBpsOf(tokenId: bigint): Promise<bigint>;
  royaltyBpsSet(tokenId: bigint): Promise<boolean>;
  agentEarningsOf(creator: string): Promise<bigint>;
};

type ERC20Methods = {
  allowance(owner: string, spender: string): Promise<bigint>;
  approve(spender: string, amount: bigint): Promise<TransactionResponse>;
  balanceOf(account: string): Promise<bigint>;
};

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
 * Thin wrapper over AxiomPaymentProcessor. Write methods wait for
 * one confirmation; read methods hit the chain directly.
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

  // ─── Write paths ─────────────────────────────────────────

  /**
   * Pay for an agent. Pulls amount from the backend signer and splits
   * between creator (credited) and treasury.
   *
   * Pre-flight: approve processor if allowance is below amount.
   */
  async payForAgent(agentTokenId: bigint, amount: bigint): Promise<{ receipt: ContractTransactionReceipt; event: PaymentProcessedEvent | null }> {
    await this.ensureAllowance(amount);
    const tx = await this.payment.contract.payForAgent(agentTokenId, amount);
    const receipt = (await tx.wait()) as ContractTransactionReceipt;
    const event = this.parsePaymentProcessed(receipt);
    return { receipt, event };
  }

  /**
   * Protocol-level compute provider payout. Pulls amount from backend
   * signer and forwards to provider.
   */
  async payComputeProvider(provider: string, amount: bigint): Promise<{ receipt: ContractTransactionReceipt; provider: string; amount: bigint }> {
    await this.ensureAllowance(amount);
    const tx = await this.payment.contract.payComputeProvider(provider, amount);
    const receipt = (await tx.wait()) as ContractTransactionReceipt;
    return { receipt, provider, amount };
  }

  /**
   * Withdraw backend signer's accumulated creator earnings.
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
   * Encode setRoyaltyBpsPermitted call for frontend submission via
   * useWriteContract. Backend signer cannot call setRoyaltyBps directly
   * (it is creator-only).
   *
   * @returns { to, data, value } — pass to useWriteContract.
   */
  async encodeSetRoyalty(agentTokenId: bigint, bps: number): Promise<{ to: string; data: string; value: bigint }> {
    const data = this.payment.iface.encodeFunctionData("setRoyaltyBpsPermitted", [agentTokenId, bps]);
    return { to: this.address, data, value: 0n };
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
   * Grant processor allowance covering amount if current allowance insufficient.
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
