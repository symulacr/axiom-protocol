// Axiom Protocol — on-chain contract addresses, keyed by chain ID.
//
// Galileo testnet (16602) addresses correspond to the Canonical Wave E-5
// deployment (2026-06-16). See:
//   docs/deployments/wave-e5-redeploy-2026-06-16.md
//
// Aristotle mainnet (16661) addresses are placeholders until the mainnet
// deployment is live.
//
// All addresses are `0x${string}` literals so wagmi v2's `useReadContracts`
// return types stay exact (viem `Address` branded type).
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

/** Default chain identifier — Galileo testnet. */
const DEFAULT_CHAIN = 16602;

/**
 * Return the address map for the given chain, falling back to Galileo when
 * the chain is unknown or not provided.
 */
export function getAddresses(chainId?: number): AddressMap {
  return ADDRESSES[chainId ?? DEFAULT_CHAIN] ?? ADDRESSES[DEFAULT_CHAIN]!;
}

// ---------------------------------------------------------------------------
// Backward-compatible aliases — all resolve to Galileo defaults so every
// existing import keeps working without changes.
// ---------------------------------------------------------------------------

/** AxiomStrategyVault — single deployed vault instance. */
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

/** AxiomPaymentProcessor — handles agent payment routing. */
export const AXIOM_PAYMENT_PROCESSOR_ADDRESS: Address =
  ADDRESSES[DEFAULT_CHAIN]!.axiomPaymentProcessor;

/** MockUSDC — testnet payment token. */
export const AXIOM_MOCK_USDC_ADDRESS: Address =
  ADDRESSES[DEFAULT_CHAIN]!.axiomMockUsdc;
