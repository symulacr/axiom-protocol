import type OpenAI from "openai";
import { FetchRequest, JsonRpcProvider } from "ethers";
import {
  ARISTOTLE_CHAIN_ID,
  resolveComputeRouterUrl,
} from "@axiom/config/networks";
import { resolveChatModel } from "@axiom/config/chat-tools";
import { createLogger } from "../utils/logger.js";

export function resolveChainId(chainId?: number): number {
  if (chainId !== undefined) return chainId;
  const env = Number(process.env.AXIOM_CHAIN_ID);
  return Number.isFinite(env) && env > 0 ? env : ARISTOTLE_CHAIN_ID;
}

export function createStaticProvider(
  evmRpc: string,
  chainId?: number,
  opts?: { timeoutMs?: number },
): JsonRpcProvider {
  const cid = resolveChainId(chainId);
  if (opts?.timeoutMs === undefined)
    return new JsonRpcProvider(evmRpc, cid, { staticNetwork: true });
  const fetchReq = new FetchRequest(evmRpc);
  fetchReq.timeout = opts.timeoutMs;
  return new JsonRpcProvider(fetchReq, cid, { staticNetwork: true });
}

// Router URL is chain-driven: explicit AXIOM_COMPUTE_BASE_URL/OG_COMPUTE_BASE_URL wins, else
// the per-chain router from the networks table (16602→Galileo testnet, 16661→mainnet).
export function getComputeBaseUrl(): string {
  return resolveComputeRouterUrl(resolveChainId());
}

// Direct proxy base used when AXIOM_COMPUTE_DIRECT_KEY is set without a URL.
const DIRECT_PROXY_BASE_URL =
  "https://compute-network-6.integratenetwork.work/v1/proxy";

/** Boot log: effective compute wiring (router, model, key prefix — never the full key). */
export function logEffectiveComputeConfig(
  chainId: number,
  modelOverride?: string,
): void {
  const router = getComputeBaseUrl();
  const model = resolveChatModel(modelOverride, chainId);
  const directKey = process.env.AXIOM_COMPUTE_DIRECT_KEY;
  const routerKey =
    process.env.AXIOM_COMPUTE_API_KEY ?? process.env.OG_COMPUTE_API_KEY;
  const key = directKey ?? routerKey;
  const keyDesc = key
    ? `${key.slice(0, 8)}…${key.slice(-4)} (${directKey ? "direct" : "router"})`
    : "MISSING (set AXIOM_COMPUTE_API_KEY)";
  console.log(
    `[boot] compute: chain=${chainId} router=${router} model=${model} key=${keyDesc}`,
  );
}

const logRouter = createLogger("compute-router");
const ROUTER_TIMEOUT_MS = 30_000;

export async function createRouterClient(model?: string): Promise<OpenAI> {
  // Lazy: the openai SDK (~1MB parsed) joins the graph only when a compute
  // client is actually created, not at boot.
  const { default: OpenAI } = await import("openai");
  const timeout = ROUTER_TIMEOUT_MS;
  logRouter.info("Creating router client", { model });

  const directKey = process.env.AXIOM_COMPUTE_DIRECT_KEY;
  if (directKey) {
    const directBase =
      process.env.AXIOM_COMPUTE_DIRECT_URL ?? DIRECT_PROXY_BASE_URL;
    logRouter.info("Using direct compute provider", { directBase, model });
    return new OpenAI({
      baseURL: directBase,
      apiKey: directKey,
      timeout,
      maxRetries: 0,
    });
  }

  // Prefer the API-key router path over the wallet-signed path when a key is configured
  const routerKey =
    process.env.AXIOM_COMPUTE_API_KEY ?? process.env.OG_COMPUTE_API_KEY;
  if (routerKey) {
    logRouter.info("Using API-key compute router", { model });
    return new OpenAI({
      baseURL: getComputeBaseUrl(),
      apiKey: routerKey,
      timeout,
      maxRetries: 0,
    });
  }

  throw new Error("AXIOM_COMPUTE_API_KEY or OG_COMPUTE_API_KEY required");
}
