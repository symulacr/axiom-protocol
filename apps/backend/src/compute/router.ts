import OpenAI from "openai";

// Default Router URLs per network.
// Mainnet (Aristotle):  chainId 16661
// Testnet (Galileo):    chainId 16602
const DEFAULT_MAINNET_URL = "https://router-api.0g.ai/v1";
const DEFAULT_TESTNET_URL = "https://router-api-testnet.integratenetwork.work/v1";

/** Known testnet provider URLs (fallback when on-chain broker is unreachable). */
const KNOWN_PROVIDERS: Record<string, string> = {
  "0xa48f01287233509FD694a22Bf840225062E67836": "https://inference-0xa48f01287233509FD694a22Bf840225062E67836.testnet.0g.ai",
  "0x8e60d466FD16798Bec4868aa4CE38586D5590049": "https://inference-0x8e60d466FD16798Bec4868aa4CE38586D5590049.testnet.0g.ai",
};

/**
 * Decode an app-sk-* token to extract the embedded provider address.
 * Format: app-sk-<base64(JSON.stringify(payload) + "|" + EIP-191 signature)>
 * Example payload:
 *   {"address":"0x644F...","provider":"0xa48f...","timestamp":1782153207671,
 *    "expiresAt":0,"nonce":"1d471e...","generation":0,"tokenId":0}
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
    return { provider: payload.provider, address: payload.address };
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

export function createRouterClient(timeout = 30_000): OpenAI {
  // 1. Direct SDK proxy path (app-sk-* key)
  const directKey = process.env.AXIOM_COMPUTE_DIRECT_KEY;
  if (directKey) {
    // First try decoding the token to get the per-provider inference endpoint.
    const tokenInfo = decodeDirectKeyToken(directKey);
    if (tokenInfo) {
      const providerUrl = KNOWN_PROVIDERS[tokenInfo.provider.toLowerCase()];
      if (providerUrl) {
        return new OpenAI({
          baseURL: `${providerUrl}/v1/proxy`,
          apiKey: directKey,
          timeout,
          maxRetries: 2,
        });
      }
    }
    // Fallback to configured or default Direct SDK proxy URL.
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
