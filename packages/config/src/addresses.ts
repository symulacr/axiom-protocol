import { getAddress } from "viem";
import { validateHex } from "./types/hex.js";

export const DEPLOYED_ADDRESSES = {
  agentNft: validateHex(
    "0xaBe9339b93320EC78400772802fc9103c56a4838",
    "AXIOM_AGENT_NFT_ADDRESS",
  ),
  strategyVault: validateHex(
    "0x170271D189Fb039c2b546106F73a3049A8a7bC38",
    "AXIOM_STRATEGY_VAULT_ADDRESS",
  ),
  teeVerifier: validateHex(
    "0x60B9d53F5410b6586D2D5395D4A309E3C9E5595A",
    "AXIOM_TEE_VERIFIER_ADDRESS",
  ),
  paymentProcessor: validateHex(
    "0x670873887CaD7442F52027702538fb2e418b8576",
    "AXIOM_PAYMENT_PROCESSOR_ADDRESS",
  ),
  mockUsdc: validateHex(
    "0x354CA53bAB51C0666964fa050628d8351f8A7d19",
    "AXIOM_MOCK_USDC_ADDRESS",
  ),
} as const;

type AddressName = keyof typeof DEPLOYED_ADDRESSES;

const ENV_VAR_NAMES: Record<AddressName, string[]> = {
  agentNft: ["AXIOM_AGENT_NFT_ADDRESS", "AGENT_NFT_ADDRESS"],
  strategyVault: ["AXIOM_STRATEGY_VAULT_ADDRESS", "VAULT_ADDRESS"],
  teeVerifier: ["AXIOM_TEE_VERIFIER_ADDRESS", "AXIOM_TEE_VERIFIER"],
  paymentProcessor: [
    "AXIOM_PAYMENT_PROCESSOR_ADDRESS",
    "PAYMENT_PROCESSOR_ADDRESS",
    "AXIOM_PAYMENT_PROCESSOR",
  ],
  mockUsdc: ["AXIOM_MOCK_USDC_ADDRESS", "AXIOM_PAYMENT_TOKEN"],
};

export function resolveAddress(
  name: AddressName,
  env: Record<string, unknown>,
): `0x${string}` {
  const varNames = ENV_VAR_NAMES[name];
  for (const varName of varNames) {
    const val = env[varName];
    if (typeof val === "string" && val) return getAddress(val);
  }
  return getAddress(DEPLOYED_ADDRESSES[name]);
}

export function getAddresses(
  env: Record<string, unknown> = typeof process !== "undefined" && process.env
    ? process.env
    : {},
) {
  return Object.fromEntries(
    (Object.keys(DEPLOYED_ADDRESSES) as AddressName[]).map((name) => [
      name,
      resolveAddress(name, env),
    ]),
  ) as Record<AddressName, `0x${string}`>;
}
