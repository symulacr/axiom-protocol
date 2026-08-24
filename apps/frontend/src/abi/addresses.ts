import { resolveAddress } from "@axiom/config/addresses";
import type { Address } from "viem";
// Runtime source of truth is env (VITE_* -> AXIOM_*); deployed.json is record-only, never read by code.
const env: Record<string, unknown> = {
  AXIOM_AGENT_NFT_ADDRESS: import.meta.env.VITE_AGENT_NFT_ADDRESS,
  AXIOM_STRATEGY_VAULT_ADDRESS: import.meta.env.VITE_STRATEGY_VAULT_ADDRESS,
  AXIOM_TEE_VERIFIER_ADDRESS: import.meta.env.VITE_TEE_VERIFIER_ADDRESS,
  AXIOM_PAYMENT_PROCESSOR_ADDRESS: import.meta.env
    .VITE_PAYMENT_PROCESSOR_ADDRESS,
};

// Only app-shell contracts — getAddresses() also hard-requires paymentToken and would crash the SPA
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
  return ADDRESSES[contract]; // chain-agnostic: addresses are env-sourced, so there is no chain gate
}

export const getAxiomStrategyVaultAddress = (chainId?: number) =>
  getContractAddress("strategyVault", chainId);
export const getAxiomAgentNftAddress = (chainId?: number) =>
  getContractAddress("agentNft", chainId);
export const getAxiomTeeVerifierAddress = (chainId?: number) =>
  getContractAddress("teeVerifier", chainId);
export const getAxiomPaymentProcessorAddress = (chainId?: number) =>
  getContractAddress("paymentProcessor", chainId);
