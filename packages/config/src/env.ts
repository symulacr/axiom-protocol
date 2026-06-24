// Single source of truth for env loading + getEnv helper.
// Seeds `process.env` from a single `.env` file via a hand-rolled loader.

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Load a `.env`-style file into `process.env`. Missing file is fine. */
export function loadEnv(rootPath: string = join(process.cwd(), "../../.env")): void {
  try {
    const content = readFileSync(rootPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env is optional
  }
}

/** `process.env[key]` or `fallback`. Throws if neither is set. */
export function getEnv(key: string, fallback?: string): string {
  const val = process.env[key];
  if (val !== undefined && val !== "") return val;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env var ${key}`);
}

/**
 * Canonical env-var namespace (all public, none are secrets):
 *
 *   AXIOM_EVM_RPC         — JSON-RPC endpoint for 0G Chain
 *   AXIOM_STORAGE_RPC     — 0G Storage indexer RPC
 *   AXIOM_ORACLE_URL      — Oracle service base URL
 *   AXIOM_FRONTEND_URL    — Frontend origin (for CORS)
 *   AXIOM_BIND            — Listen address (default: 127.0.0.1)
 *   AXIOM_PORT            — Listen port (default: 3000)
 *   AXIOM_CHAIN_ID        — EIP-155 chain ID (default: 16602)
 *
 *   # Backward-compat aliases (read on fallback, warn if used):
 *   OG_STORAGE_RPC   → AXIOM_STORAGE_RPC
 *   OG_EVM_RPC       → AXIOM_EVM_RPC
 *   RPC_URL          → AXIOM_EVM_RPC
 *   ORACLE_BASE_URL  → AXIOM_ORACLE_URL
 *   OG_CHAIN_ID      → AXIOM_CHAIN_ID
 *   TEE_SIGNER_PK    → AXIOM_TEE_SIGNER_PK
 *
 * Private keys (NEVER hardcode):
 *   DEPLOYER_PK, TEE_SIGNER_PK, ORACLE_ADMIN_PK
 */

/** Well-known env var names as a typed const object. */
export const ENV_KEYS = {
  AXIOM_AGENT_NFT_ADDRESS: "AXIOM_AGENT_NFT_ADDRESS",
  AXIOM_API_KEY: "AXIOM_API_KEY",
  AXIOM_BIND: "AXIOM_BIND",
  AXIOM_CHAIN_ID: "AXIOM_CHAIN_ID",
  AXIOM_COMPUTE_API_KEY: "AXIOM_COMPUTE_API_KEY",
  AXIOM_COMPUTE_BASE_URL: "AXIOM_COMPUTE_BASE_URL",
  AXIOM_COMPUTE_DIRECT_KEY: "AXIOM_COMPUTE_DIRECT_KEY",
  AXIOM_COMPUTE_MODEL: "AXIOM_COMPUTE_MODEL",
  AXIOM_EVM_RPC: "AXIOM_EVM_RPC",
  AXIOM_FRONTEND_URL: "AXIOM_FRONTEND_URL",
  AXIOM_MOCK_USDC_ADDRESS: "AXIOM_MOCK_USDC_ADDRESS",
  AXIOM_ORACLE_ADMIN_PK: "AXIOM_ORACLE_ADMIN_PK",
  AXIOM_ORACLE_BIND: "AXIOM_ORACLE_BIND",
  AXIOM_ORACLE_PORT: "AXIOM_ORACLE_PORT",
  AXIOM_ORACLE_URL: "AXIOM_ORACLE_URL",
  AXIOM_PAYMENT_PROCESSOR_ADDRESS: "AXIOM_PAYMENT_PROCESSOR_ADDRESS",
  AXIOM_PORT: "AXIOM_PORT",
  AXIOM_STORAGE_EVM_RPC: "AXIOM_STORAGE_EVM_RPC",
  AXIOM_STORAGE_INDEXER_RPC: "AXIOM_STORAGE_INDEXER_RPC",
  AXIOM_STORAGE_PRIVATE_KEY: "AXIOM_STORAGE_PRIVATE_KEY",
  AXIOM_STORAGE_RPC: "AXIOM_STORAGE_RPC",
  AXIOM_STRATEGY_VAULT_ADDRESS: "AXIOM_STRATEGY_VAULT_ADDRESS",
  AXIOM_TEE_SIGNER_PK: "AXIOM_TEE_SIGNER_PK",
  AXIOM_TEE_VERIFIER: "AXIOM_TEE_VERIFIER",
  AXIOM_TEE_VERIFIER_ADDRESS: "AXIOM_TEE_VERIFIER_ADDRESS",
  BACKEND_URL: "BACKEND_URL",
  DA_GRPC_CA_CERT: "DA_GRPC_CA_CERT",
  DA_GRPC_TLS_ENABLED: "DA_GRPC_TLS_ENABLED",
  DA_GRPC_URL: "DA_GRPC_URL",
  DEPLOYER_PK: "DEPLOYER_PK",
  INDEXER_DA_ENABLED: "INDEXER_DA_ENABLED",
  OG_COMPUTE_API_KEY: "OG_COMPUTE_API_KEY",
  OG_COMPUTE_BASE_URL: "OG_COMPUTE_BASE_URL",
  STORAGE_BATCH_INTERVAL_MS: "STORAGE_BATCH_INTERVAL_MS",
  STORAGE_BATCH_MAX_EVENTS: "STORAGE_BATCH_MAX_EVENTS",
} as const;

/**
 * Resolve a canonical AXIOM_* env var with backward-compatible aliases.
 * Checks `canonical` first, then each alias in order. Throws if none are set
 * and no `fallback` is provided.
 */
export function getEnvWithAlias(canonical: string, aliases: string[], fallback?: string): string {
  for (const key of [canonical, ...aliases]) {
    const val = process.env[key];
    if (val !== undefined && val !== "") return val;
  }
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env var: try ${canonical} (or one of ${aliases.join(", ")})`);
}
