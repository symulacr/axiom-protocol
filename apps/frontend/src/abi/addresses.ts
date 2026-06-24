// On-chain contract addresses — re-exported from @axiom/config
import { DEPLOYED_ADDRESSES } from "@axiom/config/addresses";
import { GALILEO_CHAIN_ID, ARISTOTLE_CHAIN_ID } from "@axiom/config/networks";
import type { Address } from 'viem';

// ── Chain-aware getter functions ──

export function getAxiomStrategyVaultAddress(chainId?: number): Address {
  if (!chainId || chainId === GALILEO_CHAIN_ID) return DEPLOYED_ADDRESSES.strategyVault as Address;
  if (chainId === ARISTOTLE_CHAIN_ID) throw new Error('AxiomStrategyVault not deployed on Aristotle mainnet yet');
  throw new Error(`Unsupported chain ${chainId}`);
}

export function getAxiomAgentNftAddress(chainId?: number): Address {
  if (!chainId || chainId === GALILEO_CHAIN_ID) return DEPLOYED_ADDRESSES.agentNft as Address;
  if (chainId === ARISTOTLE_CHAIN_ID) throw new Error('AxiomAgentNFT not deployed on Aristotle mainnet yet');
  throw new Error(`Unsupported chain ${chainId}`);
}

export function getAxiomTeeVerifierAddress(chainId?: number): Address {
  if (!chainId || chainId === GALILEO_CHAIN_ID) return DEPLOYED_ADDRESSES.teeVerifier as Address;
  if (chainId === ARISTOTLE_CHAIN_ID) throw new Error('AxiomTeeVerifier not deployed on Aristotle mainnet yet');
  throw new Error(`Unsupported chain ${chainId}`);
}

export function getAxiomPaymentProcessorAddress(chainId?: number): Address {
  if (!chainId || chainId === GALILEO_CHAIN_ID) return DEPLOYED_ADDRESSES.paymentProcessor as Address;
  if (chainId === ARISTOTLE_CHAIN_ID) throw new Error('AxiomPaymentProcessor not deployed on Aristotle mainnet yet');
  throw new Error(`Unsupported chain ${chainId}`);
}

export function getAxiomMockUsdcAddress(chainId?: number): Address {
  if (!chainId || chainId === GALILEO_CHAIN_ID) return DEPLOYED_ADDRESSES.mockUsdc as Address;
  if (chainId === ARISTOTLE_CHAIN_ID) throw new Error('MockUSDC not deployed on Aristotle mainnet yet');
  throw new Error(`Unsupported chain ${chainId}`);
}

