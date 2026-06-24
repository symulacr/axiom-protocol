import OpenAI from "openai";
import { resolveProviderUrl } from "./provider-discovery.js";

// Default Router URLs per network.
// Mainnet (Aristotle):  chainId 16661
// Testnet (Galileo):    chainId 16602
const DEFAULT_MAINNET_URL = "https://router-api.0g.ai/v1";
const DEFAULT_TESTNET_URL = "https://router-api-testnet.integratenetwork.work/v1";

/**
 * Decode an app-sk-* token to extract the embedded provider address.
 * Format: app-sk-<base64(JSON.stringify(payload) + "|" + EIP-191 signature)>
 * Example payload:
 *   {"address":"0x644F...","provider":"0xa48f...","timestamp":1782153207671,
 *    "expiresAt":0,"nonce":"1d471e...","generation":0,"tokenId":0}
 *
 * Fields are normalized: `provider` / `providerAddress` → provider string,
 * `address` / `user` → address string.
 */
function decodeDirectKeyToken(token: string): { provider: string; address: string } | null {
  if (!token.startsWith("app-sk-")) return null;
  const b64 = token.slice("app-sk-".length);
  try {
    const decoded = Buffer.from(b64, "base64").toString("utf-8");
    // Format: JSON payload || "|" || hex signature
    const pipeIdx = decoded.lastIndexOf("|");
    if (pipeIdx === -1) return null;
    const payload = JSON.parse(decoded.slice(0, pipeIdx));
    // Field normalization for SDK format variation
    const provider: string | undefined = payload.provider ?? payload.providerAddress;
    const address: string | undefined = payload.address ?? payload.user;
    if (!provider) return null;
    return { provider, address: address ?? "" };
  } catch {
    return null;
  }
}

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

export async function createRouterClient(timeout = 30_000): Promise<OpenAI> {
  // 1. Direct SDK proxy path (app-sk-* key)
  const directKey = process.env.AXIOM_COMPUTE_DIRECT_KEY;
  if (directKey) {
    const tokenInfo = decodeDirectKeyToken(directKey);
    if (tokenInfo) {
      const providerUrl = await resolveProviderUrl(tokenInfo.provider);
      if (providerUrl) {
        // Provider-specific inference endpoint from on-chain registry
        return new OpenAI({
          baseURL: `${providerUrl}/v1/proxy`,
          apiKey: directKey,
          timeout,
          maxRetries: 2,
        });
      }
      throw new Error(`Provider ${tokenInfo.provider} not found in on-chain registry`);
    }
    throw new Error("Cannot decode app-sk-* token. Check AXIOM_COMPUTE_DIRECT_KEY.");
  }
  // 2. Router API path (sk-* key against Router API)
  const routerKey = process.env.AXIOM_COMPUTE_API_KEY ?? process.env.OG_COMPUTE_API_KEY;
  if (routerKey) {
    return new OpenAI({ baseURL: getComputeBaseUrl(), apiKey: routerKey, timeout, maxRetries: 2 });
  }
  throw new Error("AXIOM_COMPUTE_DIRECT_KEY, AXIOM_COMPUTE_API_KEY, or OG_COMPUTE_API_KEY required");
}
