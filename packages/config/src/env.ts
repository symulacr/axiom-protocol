// Single source of truth for env loading + getEnv helper.
//
// Env vars come from `process.env` (https://nodejs.org/api/process.html#processenv).
// We seed `process.env` from a single `.env` file via a hand-rolled loader
// instead of the `dotenv` npm package — strict subset of
// https://github.com/motdotla/dotenv (no expansion, no multiline, no override).

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
