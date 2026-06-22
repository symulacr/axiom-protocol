// Axiom Protocol — on-chain contract addresses (0G Galileo testnet, chainId 16602).
//
// Canonical Wave E-5 deployment (2026-06-16). See:
//   docs/deployments/wave-e5-redeploy-2026-06-16.md
//
// All addresses are `0x${string}` literals so wagmi v2's `useReadContracts`
// return types stay exact (viem `Address` branded type).
import type { Address } from 'viem';

/** AxiomStrategyVault — single deployed vault instance. */
export const AXIOM_STRATEGY_VAULT_ADDRESS: Address =
  '0xb7F89e50D5A3039Da7d39528436B820371572874';

/** Vault addresses the dashboard renders (array shape for multi-vault fan-out). */
export const AXIOM_VAULT_ADDRESSES: readonly Address[] = [
  AXIOM_STRATEGY_VAULT_ADDRESS,
] as const;

/** AxiomAgentNFT proxy (ERC-1967) — calls go through the proxy, not the impl. */
export const AXIOM_AGENT_NFT_ADDRESS: Address =
  '0xf12F158a20c36a351b056FD60b3a7377ce4F1e09';

/** AxiomTeeVerifier — registered as trusted verifier on the NFT proxy. */
export const AXIOM_TEE_VERIFIER_ADDRESS: Address =
  '0x24f725198d64A3b03A8386cD8fa12BD7c591734A';

/** AxiomPaymentProcessor — handles agent payment routing. */
export const AXIOM_PAYMENT_PROCESSOR_ADDRESS: Address =
  '0x096203fB54681b66dD8ab9bA47aaB462aA8C4A5f';

/** MockUSDC — testnet payment token. */
export const AXIOM_MOCK_USDC_ADDRESS: Address =
  '0xeA13E136E59c6e919BeF2221f6ecDE2cBCEb0Dbf';
