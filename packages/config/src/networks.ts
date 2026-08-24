export interface OGNetwork {
  readonly name: string;
  readonly chainId: number;
  readonly evmRpc: string;
  readonly storageRpc: string;
  readonly computeRouterUrl: string;
  /** Default 0G Compute chat model — each chain's router has a distinct catalog (Galileo: qwen2.5-omni only). */
  readonly computeDefaultModel: string;
  readonly blockExplorer: string;
}

export const ARISTOTLE_CHAIN_ID = 16661;

/** Mainnet default chat model; mirrored as DEFAULT_CHAT_MODEL in chat-tools.ts (no cross-import: keep networks leaf-only). */
const MAINNET_DEFAULT_CHAT_MODEL = "deepseek-v4-flash";

const FALLBACK_COMPUTE_ROUTER_URL = "https://router-api.0g.ai/v1";

// Static network registry — the URLs ARE the config data (not request targets).
const OG_NETWORKS: Record<number, OGNetwork> = {
  16661: {
    name: "aristotle",
    chainId: 16661,
    evmRpc: "https://evmrpc.0g.ai",
    storageRpc: "https://indexer-storage-turbo.0g.ai",
    computeRouterUrl: "https://router-api.0g.ai/v1",
    computeDefaultModel: "deepseek-v4-flash",
    blockExplorer: "https://chainscan.0g.ai",
  },
  16602: {
    name: "galileo",
    chainId: 16602,
    evmRpc: "https://evmrpc-testnet.0g.ai",
    storageRpc: "https://indexer-storage-testnet-turbo.0g.ai",
    computeRouterUrl: "https://router-api-testnet.integratenetwork.work/v1",
    computeDefaultModel: "qwen2.5-omni",
    blockExplorer: "https://chainscan-testnet.0g.ai",
  },
};

export function pickOGNetwork(chainId: number): OGNetwork | null {
  return OG_NETWORKS[chainId] ?? null;
}

// Browser-safe guard: `process` is absent in browser bundles; globalThis access avoids a ReferenceError without typeof.
function envVar(...keys: string[]): string | undefined {
  if (globalThis.process === undefined || !process.env) return undefined;
  for (const key of keys) {
    const val = process.env[key];
    if (val) return val;
  }
  return undefined;
}

// Env override wins, else the chain's registry field, else a static fallback.
function resolveNetworkUrl(
  chainId: number | undefined,
  envKeys: string[],
  field: "evmRpc" | "storageRpc" | "computeRouterUrl",
  fallback: string,
): string {
  const varVal = envVar(...envKeys);
  if (varVal) return varVal;
  const network = chainId ? pickOGNetwork(chainId) : null;
  return network?.[field] ?? fallback;
}

export function resolveRpcUrl(chainId?: number): string {
  // Fallback matches the env default chain (16602 Galileo testnet) — .env.example says 16602.
  return resolveNetworkUrl(
    chainId,
    ["AXIOM_EVM_RPC", "OG_RPC_URL", "RPC_URL"],
    "evmRpc",
    "https://evmrpc-testnet.0g.ai",
  );
}

export function resolveStorageRpc(chainId?: number): string {
  return resolveNetworkUrl(
    chainId,
    ["AXIOM_STORAGE_RPC", "OG_STORAGE_RPC"],
    "storageRpc",
    "https://indexer-storage-turbo.0g.ai",
  );
}

export function resolveBlockExplorerUrl(chainId?: number): string {
  const network = chainId ? pickOGNetwork(chainId) : null;
  return network?.blockExplorer ?? "https://chainscan.0g.ai";
}

// Router URL derives from AXIOM_CHAIN_ID; the two routers' catalogs and keys differ — pinning one URL is a live bug.
export function resolveComputeRouterUrl(chainId?: number): string {
  return resolveNetworkUrl(
    chainId,
    ["AXIOM_COMPUTE_BASE_URL", "OG_COMPUTE_BASE_URL"],
    "computeRouterUrl",
    FALLBACK_COMPUTE_ROUTER_URL,
  );
}

/** Per-chain default compute chat model (Galileo's catalog has no deepseek models). */
export function defaultChatModelForChain(chainId?: number): string {
  const network = chainId ? pickOGNetwork(chainId) : null;
  return network?.computeDefaultModel ?? MAINNET_DEFAULT_CHAT_MODEL;
}
