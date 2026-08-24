import { useMemo } from "react";
import { parseAbi, type Abi } from "viem";
import { useChainId } from "wagmi";
import { resolveAddress } from "@axiom/config/addresses";
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
