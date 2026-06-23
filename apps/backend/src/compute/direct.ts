import OpenAI from "openai";

/**
 * Decode an app-sk-* token to extract the embedded provider address.
 * Format: app-sk-<base64(JSON.stringify(payload) + "|" + EIP-191 signature)>
 * Example payload:
 *   {"address":"0x644F...","provider":"0xa48f...","timestamp":1782153207671,
 *    "expiresAt":0,"nonce":"1d471e...","generation":0,"tokenId":0}
 */
export function decodeDirectKeyToken(token: string): { provider: string; address: string } | null {
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

/** Known testnet provider URLs (fallback when on-chain broker is unreachable). */
const KNOWN_PROVIDERS: Record<string, string> = {
  "0xa48f01287233509FD694a22Bf840225062E67836": "https://inference-0xa48f01287233509FD694a22Bf840225062E67836.testnet.0g.ai",
  "0x8e60d466FD16798Bec4868aa4CE38586D5590049": "https://inference-0x8e60d466FD16798Bec4868aa4CE38586D5590049.testnet.0g.ai",
};

/**
 * Create an OpenAI-compatible client for the **Direct** compute path.
 * Uses AXIOM_COMPUTE_DIRECT_KEY (app-sk-*) to authenticate against the
 * per-provider inference endpoint at {provider_url}/v1/proxy/chat/completions.
 *
 * Requires either:
 *   - AXIOM_COMPUTE_DIRECT_KEY env var (pre-generated app-sk- token), OR
 *   - DEPLOYER_PK (to sign on-the-fly, same as compute-context-limits.ts:75-83)
 */
export function createDirectClient(): OpenAI {
  const directKey = process.env.AXIOM_COMPUTE_DIRECT_KEY;
  if (!directKey) throw new Error("AXIOM_COMPUTE_DIRECT_KEY required");

  const tokenInfo = decodeDirectKeyToken(directKey);
  if (!tokenInfo) throw new Error("Cannot decode AXIOM_COMPUTE_DIRECT_KEY token");

  const providerUrl = KNOWN_PROVIDERS[tokenInfo.provider.toLowerCase()];
  if (!providerUrl) throw new Error(`Unknown provider: ${tokenInfo.provider}`);

  return new OpenAI({
    baseURL: `${providerUrl}/v1/proxy`,
    apiKey: directKey, // OpenAI SDK sends Authorization: Bearer <apiKey>
  });
}
