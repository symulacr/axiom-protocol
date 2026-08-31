import { useMemo } from "react";
import { parseAbi, type Abi } from "viem";
import { useChainId } from "wagmi";
import {
  resolveAddress,
  resolveAddressOptional,
} from "@axiom/config/addresses";
import {
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
} from "@axiom/config/eip712";
import type { Address } from "viem";

export { ACCESS_PROOF_TYPES } from "@axiom/config/eip712";

/** viem's ABI consumers (readContract, useReadContracts, encodeFunctionData,
 * useWriteContract, …) do NOT parse human-readable string ABIs at runtime.
 * @axiom/config/abis exports string arrays — normalize once here so every
 * viem/wagmi call site gets a parsed JSON `Abi` (passthrough when already
 * parsed). */
export function toViemAbi(abi: readonly unknown[] | Abi): Abi {
  if (abi.length > 0 && typeof abi[0] === "string") {
    return parseAbi(abi as readonly string[]);
  }
  return abi as Abi;
}

// Runtime source of truth is env (VITE_* -> AXIOM_*); deployed.json is record-only, never read by code.
const env: Record<string, unknown> = {
  AXIOM_AGENT_NFT_ADDRESS: import.meta.env.VITE_AGENT_NFT_ADDRESS,
  AXIOM_STRATEGY_VAULT_ADDRESS: import.meta.env.VITE_STRATEGY_VAULT_ADDRESS,
  AXIOM_TEE_VERIFIER_ADDRESS: import.meta.env.VITE_TEE_VERIFIER_ADDRESS,
  AXIOM_PAYMENT_PROCESSOR_ADDRESS: import.meta.env
    .VITE_PAYMENT_PROCESSOR_ADDRESS,
  AXIOM_DELEGATION_REGISTRY_ADDRESS: import.meta.env
    .VITE_DELEGATION_REGISTRY_ADDRESS,
};

// Only app-shell contracts — getAddresses() also hard-requires paymentToken and would crash the SPA
const ADDRESSES = {
  strategyVault: resolveAddress("strategyVault", env) as Address,
  agentNft: resolveAddress("agentNft", env) as Address,
  teeVerifier: resolveAddress("teeVerifier", env) as Address,
  paymentProcessor: resolveAddress("paymentProcessor", env) as Address,
} as const;

// V3 W3: not yet deployed — resolveAddressOptional returns undefined until the
// deploy lane sets the VITE_ vars; consumers must gate their UI on undefined.
const delegationRegistry = resolveAddressOptional("delegationRegistry", env) as
  Address | undefined;

// Chain-agnostic: addresses are env-sourced, so the accessors ignore any chainId arg.
export const getAxiomStrategyVaultAddress = (_chainId?: number): Address =>
  ADDRESSES.strategyVault;
export const getAxiomAgentNftAddress = (_chainId?: number): Address =>
  ADDRESSES.agentNft;
const getAxiomTeeVerifierAddress = (_chainId?: number): Address =>
  ADDRESSES.teeVerifier;
export const getAxiomPaymentProcessorAddress = (_chainId?: number): Address =>
  ADDRESSES.paymentProcessor;
export const getAxiomDelegationRegistryAddress = (
  _chainId?: number,
): Address | undefined => delegationRegistry;

const BASE_DOMAIN = {
  name: EIP712_DOMAIN_NAME,
  version: EIP712_DOMAIN_VERSION,
} as const;

export function useEip712Domain(): {
  domain: typeof BASE_DOMAIN & {
    chainId: number;
    verifyingContract: `0x${string}`;
  };
} {
  const chainId = useChainId();
  return useMemo(
    () => ({
      domain: {
        ...BASE_DOMAIN,
        chainId,
        verifyingContract: getAxiomTeeVerifierAddress(chainId),
      },
    }),
    [chainId],
  );
}
