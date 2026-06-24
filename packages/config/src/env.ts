// Single source of truth for env loading + getEnv helper.
// Seeds `process.env` from a single `.env` file via a hand-rolled loader.

import { readFileSync } from "node:fs";
import { join } from "node:path";

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

export function getEnv(key: string, fallback?: string): string {
  const val = process.env[key];
  if (val !== undefined && val !== "") return val;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env var ${key}`);
}

/**
 * # Backward-compat aliases (read on fallback, warn if used):
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

export function getEnvWithAlias(canonical: string, aliases: string[], fallback?: string): string {
  for (const key of [canonical, ...aliases]) {
    const val = process.env[key];
    if (val !== undefined && val !== "") return val;
  }
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env var: try ${canonical} (or one of ${aliases.join(", ")})`);
}
