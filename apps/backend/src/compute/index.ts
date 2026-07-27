import OpenAI from "openai";
import { FetchRequest, JsonRpcProvider } from "ethers";
import { ARISTOTLE_CHAIN_ID, pickOGNetwork } from "@axiom/config/networks";
import { createLogger } from "../utils/logger.js";

// ── broker.ts ────────────────────────────────────────────────────────────────

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
  if (opts?.timeoutMs !== undefined) {
    const fetchReq = new FetchRequest(evmRpc);
    fetchReq.timeout = opts.timeoutMs;
    return new JsonRpcProvider(fetchReq, cid, { staticNetwork: true });
  }
  return new JsonRpcProvider(evmRpc, cid, { staticNetwork: true });
}

// ── provider-discovery.ts ────────────────────────────────────────────────────

const logDiscovery = createLogger("provider-discovery");

export interface ServiceInfo {
  provider: string;
  model: string;
  uptime?: number;
  latency?: number;
}

export interface SelectProviderOptions {
  model?: string;
}

export function selectProvider(
  services: ServiceInfo[],
  opts?: SelectProviderOptions,
): ServiceInfo | undefined {
  if (services.length === 0) return undefined;
  if (opts?.model) {
    const modelLower = opts.model.toLowerCase();
    const byModel = services.find(
      (s) => s.model.toLowerCase() === modelLower && s.provider,
    );
    if (byModel) return byModel;
  }
  return services.find((s) => s.provider) ?? services[0];
}

export async function discoverProviders(): Promise<ServiceInfo[]> {
  const baseUrl = getComputeBaseUrl();
  const res = await fetch(`${baseUrl}/v1/providers`);
  if (!res.ok) {
    logDiscovery.warn("Provider discovery failed", { status: res.status });
    return [];
  }
  const services = (await res.json()) as Array<{
    provider?: string;
    model?: string;
    health?: { uptime: number; latency: number };
  }>;
  const mapped: ServiceInfo[] = (services ?? []).map(
    (s: {
      provider?: string;
      model?: string;
      health?: { uptime: number; latency: number };
    }) => ({
      provider: s.provider ?? "",
      model: s.model ?? "unknown",
      ...(s.health
        ? { uptime: s.health.uptime, latency: s.health.latency }
        : {}),
    }),
  );
  return mapped;
}

// ── router.ts ────────────────────────────────────────────────────────────────

export function getComputeBaseUrl(): string {
  const explicit =
    process.env.AXIOM_COMPUTE_BASE_URL ?? process.env.OG_COMPUTE_BASE_URL;
  if (explicit) return explicit;
  const chainId = resolveChainId();
  const network = pickOGNetwork(chainId);
  return network?.computeRouterUrl ?? "https://router-api.0g.ai/v1";
}

const logRouter = createLogger("compute-router");
const ROUTER_TIMEOUT_MS = 30_000;

export interface RouterClientOptions {
  timeout?: number;
}

export async function createRouterClient(
  model?: string,
  opts: RouterClientOptions = {},
): Promise<OpenAI> {
  const timeout = opts.timeout ?? ROUTER_TIMEOUT_MS;
  logRouter.info("Creating router client", { model });

  // Fast path: direct API key with explicit provider URL
  const directKey = process.env.AXIOM_COMPUTE_DIRECT_KEY;
  if (directKey) {
    const directBase =
      process.env.AXIOM_COMPUTE_DIRECT_URL ??
      "https://compute-network-6.integratenetwork.work/v1/proxy";
    logRouter.info("Using direct compute provider", { directBase, model });
    return new OpenAI({
      baseURL: directBase,
      apiKey: directKey,
      timeout,
      maxRetries: 0,
    });
  }

  // Prefer the API-key router path over the wallet-signed path
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
