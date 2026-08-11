import { resolveAddress } from "@axiom/config/addresses";
import type { Address } from "viem";
//
// The single source of truth for deployed addresses is
// packages/config/deployed.json. This frontend reads via VITE_ env
// variables because Vite bundles at build time — it does not have
// filesystem access to deployed.json at runtime. The env values are
// populated from deployed.json by the deployment pipeline.
//
// Only the primary AXIOM_* names are needed: resolveAddress (config)
// iterates each contract's alias list and returns on the first non-empty
// value, and every alias pointed at the same VITE_ variable. mockUsdc is
// resolved on-chain via the payment config, never from this map.
//

const env: Record<string, unknown> = {
  AXIOM_AGENT_NFT_ADDRESS: import.meta.env.VITE_AGENT_NFT_ADDRESS,
  AXIOM_STRATEGY_VAULT_ADDRESS: import.meta.env.VITE_STRATEGY_VAULT_ADDRESS,
  AXIOM_TEE_VERIFIER_ADDRESS: import.meta.env.VITE_TEE_VERIFIER_ADDRESS,
  AXIOM_PAYMENT_PROCESSOR_ADDRESS: import.meta.env.VITE_PAYMENT_PROCESSOR_ADDRESS,
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

function getContractAddress(
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
