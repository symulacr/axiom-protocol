import { getAddress } from "viem";

export type AddressName =
  | "agentNft"
  | "strategyVault"
  | "teeVerifier"
  | "paymentProcessor"
  | "mockUsdc";

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

const ADDRESS_NAMES = Object.keys(ENV_VAR_NAMES) as AddressName[];

export function resolveAddress(
  name: AddressName,
  env: Record<string, unknown>,
): `0x${string}` {
  const varNames = ENV_VAR_NAMES[name];
  for (const varName of varNames) {
    const val = env[varName];
    if (typeof val === "string" && val.trim()) {
      try {
        return getAddress(val.trim());
      } catch {
        throw new Error(
          `Invalid address for "${name}" in ${varName}="${val}" (must be 0x + 40 hex chars)`,
        );
      }
    }
  }
  throw new Error(
    `Missing deployed-address env var for "${name}" — set one of: ${varNames.join(", ")}`,
  );
}

export function getAddresses(
  env: Record<string, unknown> = typeof process !== "undefined" && process.env
    ? process.env
    : {},
): Record<AddressName, `0x${string}`> {
  return Object.fromEntries(
    ADDRESS_NAMES.map((name) => [name, resolveAddress(name, env)]),
  ) as Record<AddressName, `0x${string}`>;
}
