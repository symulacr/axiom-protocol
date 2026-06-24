// On-chain contract addresses, keyed by chain ID.
// Galileo = Wave E-5. Aristotle = placeholders until deploy.
import type { Address } from 'viem';
import { GALILEO_CHAIN_ID } from "@axiom/config/networks";

type AddressMap = {
  axiomAgentNft: Address;
  axiomStrategyVault: Address;
  axiomTeeVerifier: Address;
  axiomPaymentProcessor: Address;
  axiomMockUsdc: Address;
};

const ADDRESSES: Record<number, AddressMap> = {
  // Galileo testnet (16602)
  16602: {
    axiomAgentNft: '0xf12F158a20c36a351b056FD60b3a7377ce4F1e09',
    axiomStrategyVault: '0xb7F89e50D5A3039Da7d39528436B820371572874',
    axiomTeeVerifier: '0x24f725198d64A3b03A8386cD8fa12BD7c591734A',
    axiomPaymentProcessor: '0x096203fB54681b66dD8ab9bA47aaB462aA8C4A5f',
    axiomMockUsdc: '0xeA13E136E59c6e919BeF2221f6ecDE2cBCEb0Dbf',
  },
  // Aristotle mainnet (16661) — REPLACE with real addresses when deployed
  16661: {
    axiomAgentNft: '0x0000000000000000000000000000000000000000', // TODO
    axiomStrategyVault: '0x0000000000000000000000000000000000000000', // TODO
    axiomTeeVerifier: '0x0000000000000000000000000000000000000000', // TODO
    axiomPaymentProcessor: '0x0000000000000000000000000000000000000000', // TODO
    axiomMockUsdc: '0x0000000000000000000000000000000000000000', // TODO
  },
};

/** Default chain — Galileo testnet. */
const DEFAULT_CHAIN = GALILEO_CHAIN_ID;

// ── Chain-aware getter functions ──

export function getAxiomStrategyVaultAddress(chainId?: number): Address {
  const cid = chainId ?? DEFAULT_CHAIN;
  const addr = ADDRESSES[cid]?.axiomStrategyVault;
  if (!addr || addr === '0x0000000000000000000000000000000000000000') {
    throw new Error(`AxiomStrategyVault not deployed on chain ${cid}`);
  }
  return addr;
}

export function getAxiomAgentNftAddress(chainId?: number): Address {
  const cid = chainId ?? DEFAULT_CHAIN;
  const addr = ADDRESSES[cid]?.axiomAgentNft;
  if (!addr || addr === '0x0000000000000000000000000000000000000000') {
    throw new Error(`AxiomAgentNft not deployed on chain ${cid}`);
  }
  return addr;
}

export function getAxiomTeeVerifierAddress(chainId?: number): Address {
  const cid = chainId ?? DEFAULT_CHAIN;
  const addr = ADDRESSES[cid]?.axiomTeeVerifier;
  if (!addr || addr === '0x0000000000000000000000000000000000000000') {
    throw new Error(`AxiomTeeVerifier not deployed on chain ${cid}`);
  }
  return addr;
}

export function getAxiomPaymentProcessorAddress(chainId?: number): Address {
  const cid = chainId ?? DEFAULT_CHAIN;
  const addr = ADDRESSES[cid]?.axiomPaymentProcessor;
  if (!addr || addr === '0x0000000000000000000000000000000000000000') {
    throw new Error(`AxiomPaymentProcessor not deployed on chain ${cid}`);
  }
  return addr;
}

export function getAxiomMockUsdcAddress(chainId?: number): Address {
  const cid = chainId ?? DEFAULT_CHAIN;
  const addr = ADDRESSES[cid]?.axiomMockUsdc;
  if (!addr || addr === '0x0000000000000000000000000000000000000000') {
    throw new Error(`AxiomMockUsdc not deployed on chain ${cid}`);
  }
  return addr;
}

// ── Backward-compatible aliases (resolve to default chain) ──

/** @deprecated Use getAxiomStrategyVaultAddress(chainId) instead */
export const AXIOM_STRATEGY_VAULT_ADDRESS: Address = getAxiomStrategyVaultAddress();

/** @deprecated Use getAxiomAgentNftAddress(chainId) instead */
export const AXIOM_AGENT_NFT_ADDRESS: Address = getAxiomAgentNftAddress();

/** @deprecated Use getAxiomTeeVerifierAddress(chainId) instead */
export const AXIOM_TEE_VERIFIER_ADDRESS: Address = getAxiomTeeVerifierAddress();

/** @deprecated Use getAxiomPaymentProcessorAddress(chainId) instead */
export const AXIOM_PAYMENT_PROCESSOR_ADDRESS: Address = getAxiomPaymentProcessorAddress();

/** @deprecated Use getAxiomMockUsdcAddress(chainId) instead */
export const AXIOM_MOCK_USDC_ADDRESS: Address = getAxiomMockUsdcAddress();
