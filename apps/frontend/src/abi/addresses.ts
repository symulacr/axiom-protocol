import { getAddresses } from "@axiom/config/addresses";
import { GALILEO_CHAIN_ID } from "@axiom/config/networks";
import type { Address } from "viem";

const env: Record<string, unknown> = {
  AXIOM_AGENT_NFT_ADDRESS: import.meta.env.VITE_AGENT_NFT_ADDRESS,
  AGENT_NFT_ADDRESS: import.meta.env.VITE_AGENT_NFT_ADDRESS,
  AXIOM_STRATEGY_VAULT_ADDRESS: import.meta.env.VITE_STRATEGY_VAULT_ADDRESS,
  VAULT_ADDRESS: import.meta.env.VITE_STRATEGY_VAULT_ADDRESS,
  AXIOM_TEE_VERIFIER_ADDRESS: import.meta.env.VITE_TEE_VERIFIER_ADDRESS,
  AXIOM_TEE_VERIFIER: import.meta.env.VITE_TEE_VERIFIER_ADDRESS,
  AXIOM_PAYMENT_PROCESSOR_ADDRESS: import.meta.env.VITE_PAYMENT_PROCESSOR_ADDRESS,
  PAYMENT_PROCESSOR_ADDRESS: import.meta.env.VITE_PAYMENT_PROCESSOR_ADDRESS,
  AXIOM_PAYMENT_PROCESSOR: import.meta.env.VITE_PAYMENT_PROCESSOR_ADDRESS,
  AXIOM_MOCK_USDC_ADDRESS: import.meta.env.VITE_MOCK_USDC_ADDRESS,
  AXIOM_PAYMENT_TOKEN: import.meta.env.VITE_MOCK_USDC_ADDRESS,
};

const A = getAddresses(env);
const ADDRESSES = {
  strategyVault: A.strategyVault as Address,
  agentNft: A.agentNft as Address,
  teeVerifier: A.teeVerifier as Address,
  paymentProcessor: A.paymentProcessor as Address,
} as const;

type ContractName = keyof typeof ADDRESSES;

export function getContractAddress(
  contract: ContractName,
  chainId?: number,
): Address {
  if (chainId !== undefined && chainId !== GALILEO_CHAIN_ID) {
    throw new Error(`Contract ${contract} not deployed on chain ${chainId}`);
  }
  return ADDRESSES[contract];
}

export const getAxiomStrategyVaultAddress = (chainId?: number) =>
  getContractAddress("strategyVault", chainId);
export const getAxiomAgentNftAddress = (chainId?: number) =>
  getContractAddress("agentNft", chainId);
export const getAxiomTeeVerifierAddress = (chainId?: number) =>
  getContractAddress("teeVerifier", chainId);
export const getAxiomPaymentProcessorAddress = (chainId?: number) =>
  getContractAddress("paymentProcessor", chainId);
