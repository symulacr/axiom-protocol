import { getAddress } from "viem";
import { validateHex } from "./types/hex.js";

/** Hardcoded deployed addresses — last-resort fallback. */
export const DEPLOYED_ADDRESSES = {
  agentNft:         validateHex("0x6f82d061a903E48Ce1810F8d42536C6A837ed684", "AXIOM_AGENT_NFT_ADDRESS"),
  strategyVault:    validateHex("0xB30061Ea93b60FCbAE11C2b06FE3Db3C84FAA367", "AXIOM_STRATEGY_VAULT_ADDRESS"),
  teeVerifier:      validateHex("0x63Edfd4CD68A77AEdC4A56550Ae94e7F86d497B7", "AXIOM_TEE_VERIFIER_ADDRESS"),
  paymentProcessor: validateHex("0x97a32707d948F91175706ca5509c7bfCC643a1dD", "AXIOM_PAYMENT_PROCESSOR_ADDRESS"),
  mockUsdc:         validateHex("0x354CA53bAB51C0666964fa050628d8351f8A7d19", "AXIOM_MOCK_USDC_ADDRESS"),
} as const;

type AddressName = keyof typeof DEPLOYED_ADDRESSES;

/**
 * Canonical (preferred) env var → deprecated aliases for each address.
 * First defined non-empty string wins.
 */
const ENV_VAR_NAMES: Record<AddressName, string[]> = {
  agentNft:         ["AXIOM_AGENT_NFT_ADDRESS", "AGENT_NFT_ADDRESS"],
  strategyVault:    ["AXIOM_STRATEGY_VAULT_ADDRESS", "VAULT_ADDRESS"],
  teeVerifier:      ["AXIOM_TEE_VERIFIER_ADDRESS", "AXIOM_TEE_VERIFIER"],
  paymentProcessor: ["AXIOM_PAYMENT_PROCESSOR_ADDRESS", "PAYMENT_PROCESSOR_ADDRESS", "AXIOM_PAYMENT_PROCESSOR"],
  mockUsdc:         ["AXIOM_MOCK_USDC_ADDRESS", "AXIOM_PAYMENT_TOKEN"],
};

/**
 * Resolve a contract address: env override (canonical, then deprecated) → hardcoded fallback.
 * Returns a viem-checksummed address.
 *
 * @param name - Address name matching DEPLOYED_ADDRESSES keys
 * @param env - Object mapping env var names to values (e.g. zod-parsed env or process.env)
 */
export function resolveAddress(name: AddressName, env: Record<string, unknown>): `0x${string}` {
  const varNames = ENV_VAR_NAMES[name];
  for (const varName of varNames) {
    const val = env[varName];
    if (typeof val === "string" && val) return getAddress(val);
  }
  return getAddress(DEPLOYED_ADDRESSES[name]);
}
