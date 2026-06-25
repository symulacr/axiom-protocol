// On-chain contract addresses — re-exported from @axiom/config
import { DEPLOYED_ADDRESSES } from "@axiom/config/addresses";
import { GALILEO_CHAIN_ID } from "@axiom/config/networks";
import type { Address } from 'viem';

const ADDRESSES = {
  strategyVault: DEPLOYED_ADDRESSES.strategyVault as Address,
  agentNft: DEPLOYED_ADDRESSES.agentNft as Address,
  teeVerifier: DEPLOYED_ADDRESSES.teeVerifier as Address,
  paymentProcessor: DEPLOYED_ADDRESSES.paymentProcessor as Address,
  mockUsdc: DEPLOYED_ADDRESSES.mockUsdc as Address,
} as const;

type ContractName = keyof typeof ADDRESSES;

export function getContractAddress(contract: ContractName, chainId?: number): Address {
  if (chainId !== undefined && chainId !== GALILEO_CHAIN_ID) {
    throw new Error(`Contract ${contract} not deployed on chain ${chainId}`);
  }
  return ADDRESSES[contract];
}

// Backward-compatible named exports
export const getAxiomStrategyVaultAddress = (chainId?: number) => getContractAddress('strategyVault', chainId);
export const getAxiomAgentNftAddress = (chainId?: number) => getContractAddress('agentNft', chainId);
export const getAxiomTeeVerifierAddress = (chainId?: number) => getContractAddress('teeVerifier', chainId);
export const getAxiomPaymentProcessorAddress = (chainId?: number) => getContractAddress('paymentProcessor', chainId);
export const getAxiomMockUsdcAddress = (chainId?: number) => getContractAddress('mockUsdc', chainId);

