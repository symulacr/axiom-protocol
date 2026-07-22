import { getAddress } from "viem";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

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

// Try to load from deployed.json as fallback
let deployedAddresses: Record<string, string> | null = null;
try {
  const p = join(import.meta.dirname, "../deployed.json");
  if (existsSync(p)) {
    const data = JSON.parse(readFileSync(p, "utf8"));
    deployedAddresses = data.contracts;
  }
} catch {
  // Not available at build time for frontend — that's fine
}

export function resolveAddress(
  name: AddressName,
  env: Record<string, unknown>,
): `0x${string}` {
  // 1. Try env vars first (highest priority — used in production)
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
  // 2. Fallback to deployed.json for local dev / CI
  if (deployedAddresses?.[name]) {
    try {
      return getAddress(deployedAddresses[name]);
    } catch {
      // fall through to error below
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
