import OpenAI from "openai";
import { pickOGNetwork, GALILEO_CHAIN_ID } from "@axiom/config/networks";
import { resolveProviderUrl } from "./provider-discovery.js";

/**
 * Resolve the 0G Compute Router base URL.
 *
 * Precedence:
 *   1. `OG_COMPUTE_BASE_URL` env var (explicit override)
 *   2. Network-specific URL from pickOGNetwork()
 *   3. Galileo testnet fallback
 */
export function getComputeBaseUrl(): string {
  const explicit = process.env.OG_COMPUTE_BASE_URL;
  if (explicit) return explicit;
  const chainId = Number(process.env.AXIOM_CHAIN_ID) || GALILEO_CHAIN_ID;
  const network = pickOGNetwork(chainId);
  return network?.computeRouterUrl ?? "https://router-api-testnet.integratenetwork.work/v1";
}

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

const ROUTER_TIMEOUT_MS = 30_000;

export async function createRouterClient(timeout = ROUTER_TIMEOUT_MS): Promise<OpenAI> {
  const directKey = process.env.AXIOM_COMPUTE_DIRECT_KEY;
  if (directKey) {
    const tokenInfo = decodeDirectKeyToken(directKey);
    if (tokenInfo) {
      const providerUrl = await resolveProviderUrl(tokenInfo.provider);
      if (providerUrl) {
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
  const routerKey = process.env.AXIOM_COMPUTE_API_KEY ?? process.env.OG_COMPUTE_API_KEY;
  if (routerKey) {
    return new OpenAI({ baseURL: getComputeBaseUrl(), apiKey: routerKey, timeout, maxRetries: 2 });
  }
  throw new Error("AXIOM_COMPUTE_DIRECT_KEY, AXIOM_COMPUTE_API_KEY, or OG_COMPUTE_API_KEY required");
}
