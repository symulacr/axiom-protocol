import type { TransactionResponse } from "ethers";

export interface PaymentProcessorMethods {
  payForAgent(agentTokenId: bigint, amount: bigint): Promise<TransactionResponse>;
  payComputeProvider(provider: string, amount: bigint): Promise<TransactionResponse>;
  withdrawAgentEarnings(): Promise<TransactionResponse>;
  setRoyaltyBps(agentTokenId: bigint, bps: number): Promise<TransactionResponse>;
  setRoyaltyBpsPermitted(agentTokenId: bigint, bps: number): Promise<TransactionResponse>;
  protocolTreasury(): Promise<string>;
  protocolFeeBps(): Promise<bigint>;
  paymentToken(): Promise<string>;
  royaltyBpsOf(agentTokenId: bigint): Promise<bigint>;
  royaltyBpsSet(agentTokenId: bigint): Promise<boolean>;
  agentEarningsOf(creator: string): Promise<bigint>;
}

export interface ERC20Methods {
  allowance(owner: string, spender: string): Promise<bigint>;
  approve(spender: string, amount: bigint): Promise<TransactionResponse>;
  balanceOf(account: string): Promise<bigint>;
}

export interface AgentNFTMethods {
  mintFee(): Promise<bigint>;
  mint(iDatas: { dataDescription: string; dataHash: string }[], to: string, overrides?: { value?: bigint }): Promise<TransactionResponse>;
  intelligentDatasOf(tokenId: bigint): Promise<{ dataDescription: string; dataHash: string }[]>;
  creatorOf(tokenId: bigint): Promise<string>;
  ownerOf(tokenId: bigint): Promise<string>;
  iTransferFrom(from: string, to: string, tokenId: bigint, proofs: unknown[]): Promise<TransactionResponse>;
  supportsInterface(interfaceId: string): Promise<boolean>;
  name(): Promise<string>;
  symbol(): Promise<string>;
}

export interface StrategyVaultMethods {
  deposit(tokenId: bigint, overrides?: { value?: bigint }): Promise<TransactionResponse>;
  setStrategy(tokenId: bigint, merkleRoot: string, dailyLimit: bigint): Promise<TransactionResponse>;
  balanceOf(tokenId: bigint): Promise<bigint>;
  strategyOf(tokenId: bigint): Promise<[string, bigint, bigint, bigint]>;
  execute(tokenId: bigint, target: string, value: bigint, data: string, proof: string[]): Promise<TransactionResponse>;
}
