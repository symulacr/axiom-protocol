// Axiom Protocol — on-chain contract addresses, keyed by chain ID.
//
// Galileo testnet addresses correspond to the Wave E-5 deployment.
// Aristotle mainnet addresses are placeholders until mainnet is live.
import type { Address } from 'viem';

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

import { GALILEO_CHAIN_ID } from "@axiom/config/networks";

/** Default chain — Galileo testnet. */
const DEFAULT_CHAIN = GALILEO_CHAIN_ID;

/** Return the address map for the given chain (fallback to Galileo). */
export function getAddresses(chainId?: number): AddressMap {
  return ADDRESSES[chainId ?? DEFAULT_CHAIN] ?? ADDRESSES[DEFAULT_CHAIN]!;
}

// Backward-compatible aliases (resolve to Galileo defaults).

export const AXIOM_STRATEGY_VAULT_ADDRESS: Address =
  ADDRESSES[DEFAULT_CHAIN]!.axiomStrategyVault;

/** Vault addresses the dashboard renders (array shape for multi-vault fan-out). */
export const AXIOM_VAULT_ADDRESSES: readonly Address[] = [
  ADDRESSES[DEFAULT_CHAIN]!.axiomStrategyVault,
] as const;

/** AxiomAgentNFT proxy (ERC-1967) — calls go through the proxy, not the impl. */
export const AXIOM_AGENT_NFT_ADDRESS: Address =
  ADDRESSES[DEFAULT_CHAIN]!.axiomAgentNft;

/** AxiomTeeVerifier — registered as trusted verifier on the NFT proxy. */
export const AXIOM_TEE_VERIFIER_ADDRESS: Address =
  ADDRESSES[DEFAULT_CHAIN]!.axiomTeeVerifier;

export const AXIOM_PAYMENT_PROCESSOR_ADDRESS: Address =
  ADDRESSES[DEFAULT_CHAIN]!.axiomPaymentProcessor;

/** MockUSDC — testnet payment token. */
export const AXIOM_MOCK_USDC_ADDRESS: Address =
  ADDRESSES[DEFAULT_CHAIN]!.axiomMockUsdc;
