import type OpenAI from "openai";
import { FetchRequest, FallbackProvider, JsonRpcProvider } from "ethers";
import {
  ARISTOTLE_CHAIN_ID,
  resolveComputeRouterUrl,
  resolveRpcFallbackUrls,
  resolveRpcUrl,
} from "@axiom/config/networks";
import { resolveChatModel } from "@axiom/config/chat-tools";
import { createLogger } from "./utils/logger.js";

// Cache keyed by resolved RPC URL so per-chain lookups get distinct providers instead of chain #1's forever.
const providers = new Map<string, JsonRpcProvider | FallbackProvider>();

// Shared provider is chain-aware: when fallback URLs exist (AXIOM_EVM_RPC_FALLBACKS
// env or the chain registry), an ethers FallbackProvider with quorum 1 gives
// first-healthy-provider semantics — an RPC outage degrades to fallbacks instead
// of failing every read/write. quorum 1 because write lanes must not wait for
// multi-provider agreement (rd2 §1 R4). staticNetwork is kept per-provider.
export function getSharedProvider(
  chainId?: number,
): JsonRpcProvider | FallbackProvider {
  const rpcUrl = resolveRpcUrl(chainId);
  let provider = providers.get(rpcUrl);
  if (!provider) {
    const fallbackUrls = resolveRpcFallbackUrls(chainId).filter(
      (url) => url !== rpcUrl,
    );
    const makeProvider = (url: string) => {
      const fetchReq = new FetchRequest(url);
      fetchReq.timeout = 10_000;
      return new JsonRpcProvider(fetchReq, undefined, { staticNetwork: true });
    };
    const primary = makeProvider(rpcUrl);
    provider =
      fallbackUrls.length > 0
        ? new FallbackProvider(
            [primary, ...fallbackUrls.map(makeProvider)].map((p) => ({
              provider: p,
              priority: 0,
            })),
            undefined,
            { quorum: 1 },
          )
        : primary;
    providers.set(rpcUrl, provider);
  }
  return provider;
}

// FallbackProvider (ethers v6) extends AbstractProvider only — no raw `.send()`.
// Raw JSON-RPC lanes route through this helper: JsonRpcProvider passes through;
// FallbackProvider serves eth_getLogs via the Provider API and re-serializes
// each Log back to the JSON-RPC wire shape (hex-numeric fields) callers parse.
const toHexQty = (n: number): string => "0x" + n.toString(16);

export async function sendRpcRaw(
  provider: JsonRpcProvider | FallbackProvider,
  method: string,
  params: Array<unknown> | Record<string, unknown>,
): Promise<unknown> {
  if (typeof (provider as JsonRpcProvider).send === "function") {
    return (provider as JsonRpcProvider).send(
      method,
      params as Array<any> | Record<string, any>,
    );
  }
  if (
    method !== "eth_getLogs" ||
    !Array.isArray(params) ||
    params.length !== 1
  ) {
    throw new Error(
      `sendRpcRaw: ${method} is not supported on FallbackProvider`,
    );
  }
  const filter = params[0] as {
    address?: string;
    topics?: (string | string[] | null)[];
    fromBlock?: string;
    toBlock?: string;
  };
  const logs = await provider.getLogs({
    ...(filter.address ? { address: filter.address } : {}),
    ...(filter.topics ? { topics: filter.topics } : {}),
    ...(filter.fromBlock ? { fromBlock: filter.fromBlock } : {}),
    ...(filter.toBlock ? { toBlock: filter.toBlock } : {}),
  });
  return logs.map((log) => ({
    address: log.address,
    topics: log.topics,
    data: log.data,
    blockNumber: toHexQty(log.blockNumber),
    blockHash: log.blockHash,
    transactionHash: log.transactionHash,
    transactionIndex: toHexQty(log.transactionIndex),
    logIndex: toHexQty(log.index),
    removed: log.removed,
  }));
}

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

// Direct proxy base used when AXIOM_COMPUTE_DIRECT_KEY is set without a URL —
// declared/validated in @axiom/config env-schema (AXIOM_COMPUTE_DIRECT_PROXY_URL, W-2);
// this literal mirrors the schema default so resolution works even when callers
// construct config without running the full env parse (e.g. unit tests).
// L6-P1 (waves-ledger): this direct-proxy shim is the second of two compute ingress
// paths, gated behind AXIOM_COMPUTE_DIRECT_KEY. Decision pending (ledger L6-P1):
// (1) if direct-provider mode ships, adopt @0gfoundation/0g-compute-ts-sdk@0.9.0 —
// its broker API makes direct mode first-class and replaces this shim while adding
// ledger/auto-fund/TEE-verify (R3 §5, npm-verified latest 0.9.0, 2026-07-17);
// (2) if router-only, delete the shim and this literal. Either way it should not
// survive as a third way.
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

// Router per-request routing controls (0G routing docs): Max-Price-Usd-Prompt/-Completion
// are hard USD/1M-token ceilings applied BEFORE sort+failover, so an outage fallback can
// never silently route to a priced-out provider (empty pool → 400, not 503 — do not blind-retry).
// Trust-Mode floors the TEE tier (verified = TeeML+TeeTLS verifiable execution).
// Sent as defaultHeaders on the cached client so they survive router-internal failover.
function routerDefaultHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const maxPrice = process.env.AXIOM_COMPUTE_MAX_PRICE_USD;
  if (maxPrice) {
    headers["X-0G-Provider-Max-Price-Usd-Prompt"] = maxPrice;
    headers["X-0G-Provider-Max-Price-Usd-Completion"] = maxPrice;
  }
  headers["X-0G-Provider-Trust-Mode"] =
    process.env.AXIOM_COMPUTE_TRUST_MODE ?? "verified";
  return headers;
}

// Module-level singleton (StrategyRunner precedent, orchestrator/index.ts getClient):
// one OpenAI client per (baseURL, key) keeps HTTP keep-alive alive across requests and
// imports the SDK once. Creation is not cached until it succeeds, so a transient failure
// retries on the next request.
let cachedClient: OpenAI | null = null;
let cachedClientKey: string | null = null;

export async function createRouterClient(model?: string): Promise<OpenAI> {
  const directKey = process.env.AXIOM_COMPUTE_DIRECT_KEY;
  const routerKey =
    process.env.AXIOM_COMPUTE_API_KEY ?? process.env.OG_COMPUTE_API_KEY;
  // Lazy: the openai SDK (~1MB parsed) joins the graph only when a compute
  // client is actually created, not at boot.
  const { default: OpenAI } = await import("openai");
  const timeout = ROUTER_TIMEOUT_MS;

  if (directKey) {
    const directBase =
      process.env.AXIOM_COMPUTE_DIRECT_URL ??
      process.env.AXIOM_COMPUTE_DIRECT_PROXY_URL ??
      DIRECT_PROXY_BASE_URL;
    const key = `direct:${directBase}:${directKey}`;
    if (cachedClient && cachedClientKey === key) return cachedClient;
    logRouter.info("Using direct compute provider", { directBase, model });
    cachedClientKey = key;
    // `fetch` resolved lazily so the OpenAI constructor doesn't pin a stale
    // reference (matters for anything that swaps globalThis.fetch).
    cachedClient = new OpenAI({
      baseURL: directBase,
      apiKey: directKey,
      timeout,
      maxRetries: 0,
      defaultHeaders: routerDefaultHeaders(),
      fetch: (input, init) => globalThis.fetch(input, init),
    });
    return cachedClient;
  }

  // Prefer the API-key router path over the wallet-signed path when a key is configured
  if (routerKey) {
    const baseURL = getComputeBaseUrl();
    const key = `router:${baseURL}:${routerKey}`;
    if (cachedClient && cachedClientKey === key) return cachedClient;
    logRouter.info("Creating router client", { model, baseURL });
    cachedClientKey = key;
    cachedClient = new OpenAI({
      baseURL,
      apiKey: routerKey,
      timeout,
      maxRetries: 0,
      defaultHeaders: routerDefaultHeaders(),
      fetch: (input, init) => globalThis.fetch(input, init),
    });
    return cachedClient;
  }

  throw new Error("AXIOM_COMPUTE_API_KEY or OG_COMPUTE_API_KEY required");
}
