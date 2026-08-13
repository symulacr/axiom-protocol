import type {
  ContractTransactionReceipt,
  TransactionResponse,
  Wallet,
  JsonRpcProvider,
  Log,
  EventLog,
} from "ethers";
import { TypedContract } from "@axiom/config/types/contract";
import { PAYMENT_PROCESSOR_ABI, ERC20_ABI } from "@axiom/config/abis";

type PaymentProcessorMethods = {
  payForAgent(
    agentTokenId: bigint,
    amount: bigint,
  ): Promise<TransactionResponse>;
  withdrawAgentEarnings(): Promise<TransactionResponse>;
  setRoyaltyBps(
    agentTokenId: bigint,
    bps: number,
  ): Promise<TransactionResponse>;
  protocolTreasury(): Promise<string>;
  protocolFeeBps(): Promise<bigint>;
  paymentToken(): Promise<string>;
  agentEarningsOf(creator: string): Promise<bigint>;
};

type ERC20Methods = {
  allowance(owner: string, spender: string): Promise<bigint>;
  approve(spender: string, amount: bigint): Promise<TransactionResponse>;
  balanceOf(account: string): Promise<bigint>;
};

export interface PaymentConfig {
  readonly address: string;
  readonly signer: Wallet;
  readonly provider: JsonRpcProvider;
  readonly paymentTokenAddress: string;
}

interface PaymentProcessedEvent {
  readonly agentTokenId: bigint;
  readonly payer: string;
  readonly creator: string;
  readonly amount: bigint;
  readonly creatorCut: bigint;
  readonly protocolCut: bigint;
}

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
    this.payment = new TypedContract<PaymentProcessorMethods>(
      cfg.address,
      PAYMENT_PROCESSOR_ABI,
      cfg.signer,
    );
    this.token = new TypedContract<ERC20Methods>(
      cfg.paymentTokenAddress,
      ERC20_ABI,
      cfg.signer,
    );
  }

  async payForAgent(
    agentTokenId: bigint,
    amount: bigint,
  ): Promise<{
    receipt: ContractTransactionReceipt;
    event: PaymentProcessedEvent | null;
  }> {
    await this.ensureAllowance(amount);
    const receipt = await this.sendAndWait(
      this.payment.contract.payForAgent(agentTokenId, amount),
    );
    const event = this.parsePaymentProcessed(receipt);
    return { receipt, event };
  }

  encodeSetRoyalty(
    agentTokenId: bigint,
    bps: number,
  ): { to: string; data: string; value: bigint } {
    const data = this.payment.iface.encodeFunctionData("setRoyaltyBps", [
      agentTokenId,
      bps,
    ]);
    return { to: this.address, data, value: 0n };
  }

  earningsOf(creator: string): Promise<bigint> {
    return this.payment.contract.agentEarningsOf(creator);
  }

  async protocolConfig(): Promise<{
    paymentToken: string;
    protocolFeeBps: bigint;
    protocolTreasury: string;
  }> {
    const [paymentToken, protocolFeeBps, protocolTreasury] = await Promise.all([
      this.payment.contract.paymentToken(),
      this.payment.contract.protocolFeeBps(),
      this.payment.contract.protocolTreasury(),
    ]);
    return { paymentToken, protocolFeeBps, protocolTreasury };
  }

  private async ensureAllowance(amount: bigint): Promise<void> {
    // Exact-amount allowance only, never MaxUint256: the processor needs just `amount`, so no unlimited spending power is left (frontend mirrors this; only the E2E harness uses infinity).
    const current = await this.token.contract.allowance(
      this.signer.address,
      this.address,
    );
    if (current >= amount) return;
    const tx = await this.token.contract.approve(this.address, amount);
    await tx.wait();
  }

  private async sendAndWait(
    txPromise: Promise<TransactionResponse>,
  ): Promise<ContractTransactionReceipt> {
    const tx = await txPromise;
    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error(`tx ${tx.hash} returned no receipt`);
    }
    return receipt as ContractTransactionReceipt;
  }

  private findParsedEvent(
    receipt: ContractTransactionReceipt,
    eventName: string,
  ) {
    const topic = this.payment.iface.getEvent(eventName)?.topicHash;
    const log = topic
      ? receipt.logs.find((l: Log | EventLog) => l.topics[0] === topic)
      : undefined;
    if (!log) return null;
    return this.payment.iface.parseLog(
      log as unknown as { topics: string[]; data: string },
    );
  }

  private parsePaymentProcessed(
    receipt: ContractTransactionReceipt,
  ): PaymentProcessedEvent | null {
    const parsed = this.findParsedEvent(receipt, "PaymentProcessed");
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
