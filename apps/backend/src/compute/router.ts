import OpenAI from "openai";

export { createDirectClient } from "./direct.js";

// Default Router URLs per network.
// Mainnet (Aristotle):  chainId 16661 — https://router-api.0g.ai/v1
// Testnet (Galileo):    chainId 16602 — https://router-api-testnet.integratenetwork.work/v1
// Source: https://docs.0g.ai/ai-context
const DEFAULT_MAINNET_URL = "https://router-api.0g.ai/v1";
const DEFAULT_TESTNET_URL = "https://router-api-testnet.integratenetwork.work/v1";

/**
 * Resolve the 0G Compute Router base URL.
 *
 * Precedence:
 *   1. `OG_COMPUTE_BASE_URL` env var (explicit override)
 *   2. Mainnet URL when `AXIOM_CHAIN_ID` is `16661` (Aristotle)
 *   3. Testnet URL (Galileo) — fallback
 */
export function getComputeBaseUrl(): string {
  const explicit = process.env.OG_COMPUTE_BASE_URL;
  if (explicit) return explicit;
  const chainId = Number(process.env.AXIOM_CHAIN_ID) || 16602;
  return chainId === 16661 ? DEFAULT_MAINNET_URL : DEFAULT_TESTNET_URL;
}

export function createRouterClient(timeout = 30_000): OpenAI {
  // 1. Direct SDK proxy path (app-sk-* key against Direct SDK proxy)
  const directKey = process.env.AXIOM_COMPUTE_DIRECT_KEY;
  if (directKey) {
    const baseURL = process.env.AXIOM_COMPUTE_BASE_URL ?? "https://compute-network-6.integratenetwork.work/v1/proxy";
    return new OpenAI({ baseURL, apiKey: directKey, timeout, maxRetries: 2 });
  }
  // 2. Router API path (sk-* key against Router API)
  const routerKey = process.env.AXIOM_COMPUTE_API_KEY ?? process.env.OG_COMPUTE_API_KEY;
  if (routerKey) {
    return new OpenAI({ baseURL: getComputeBaseUrl(), apiKey: routerKey, timeout, maxRetries: 2 });
  }
  throw new Error("AXIOM_COMPUTE_DIRECT_KEY, AXIOM_COMPUTE_API_KEY, or OG_COMPUTE_API_KEY required");
}

/**
 * Create a compute client, trying Direct SDK proxy first, falling back to
 * Router API. This is the primary entry point for the orchestrator and HTTP
 * routes. Throws only if no credentials are configured.
 */
export function createComputeClient(): OpenAI {
  return createRouterClient();
}

export async function chatCompletion(
  client: OpenAI,
  model: string,
  messages: Array<{ role: "system" | "user"; content: string }>
): Promise<string> {
  const res = await client.chat.completions.create({ model, messages });
  return res.choices?.[0]?.message?.content ?? "";
}
