import { resolveAddress } from "@axiom/config/addresses";
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
  // Mock USDC only used by payment flows — resolved on demand if needed
  AXIOM_MOCK_USDC_ADDRESS: import.meta.env.VITE_MOCK_USDC_ADDRESS,
  AXIOM_PAYMENT_TOKEN: import.meta.env.VITE_MOCK_USDC_ADDRESS,
};

// Resolve only contracts required for app shell / agents / vault — do not
// call getAddresses() which hard-requires mockUsdc and crashes the SPA.
const ADDRESSES = {
  strategyVault: resolveAddress("strategyVault", env) as Address,
  agentNft: resolveAddress("agentNft", env) as Address,
  teeVerifier: resolveAddress("teeVerifier", env) as Address,
  paymentProcessor: resolveAddress("paymentProcessor", env) as Address,
} as const;

type ContractName = keyof typeof ADDRESSES;

export function getContractAddress(
  contract: ContractName,
  _chainId?: number,
): Address {
  // Chain-agnostic: addresses are env-sourced, so there is no chain gate.
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
