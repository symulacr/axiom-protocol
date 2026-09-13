export interface OGNetwork {
  readonly name: string;
  readonly chainId: number;
  readonly evmRpc: string;
  /** Sanctioned 3rd-party RPC fallbacks, appended after the primary (rd2 §1). */
  readonly evmRpcFallbacks?: readonly string[];
  readonly storageRpc: string;
  readonly computeRouterUrl: string;
  /** Default 0G Compute chat model — each chain's router has a distinct catalog (Galileo catalog: qwen2.5-omni, qwen-image-edit; live /v1/models as of 2026-08-31). */
  readonly computeDefaultModel: string;
  readonly blockExplorer: string;
  /**
   * Browser RPC-override allowlist (OPT-11 single source). Absent → derived as
   * [evmRpc, ...evmRpcFallbacks]. Mainnet pins `rpc.0g.ai` explicitly: it appears
   * in no official endpoint list, but it is same-org 0g.ai infrastructure.
   */
  readonly rpcAllowlist?: readonly string[];
}

export const ARISTOTLE_CHAIN_ID = 16661;

/** Mainnet default chat model; mirrored as DEFAULT_CHAT_MODEL in chat-tools.ts (no cross-import: keep networks leaf-only). */
const MAINNET_DEFAULT_CHAT_MODEL = "deepseek-v4-flash";

const FALLBACK_COMPUTE_ROUTER_URL = "https://router-api.0g.ai/v1";

// Static network registry — the URLs ARE the config data (not request targets).
// Aristotle mainnet is the default; Galileo testnet (16602) is the retained
// first-class dev lane (dev/test deploy + e2e target), not a production network.
//
// Fallbacks are keyless PUBLIC endpoints from providers recommended in the
// official 0G docs (docs.0g.ai mainnet-overview: "3rd Party RPCs recommended
// for production" — dRPC, thirdweb; verified against the public-endpoint index
// 2026-09-13, MCP ledger W2-1). Ordered: primary first, first-healthy wins
// (quorum-1 FallbackProvider semantics live in the callers).
const OG_NETWORKS: Record<number, OGNetwork> = {
  16661: {
    name: "aristotle",
    chainId: 16661,
    evmRpc: "https://evmrpc.0g.ai",
    evmRpcFallbacks: [
      "https://0g-mainnet.drpc.org",
      "https://16661.rpc.thirdweb.com",
    ],
    storageRpc: "https://indexer-storage-turbo.0g.ai",
    computeRouterUrl: "https://router-api.0g.ai/v1",
    computeDefaultModel: "deepseek-v4-flash",
    blockExplorer: "https://chainscan.0g.ai",
    rpcAllowlist: [
      "https://evmrpc.0g.ai",
      "https://rpc.0g.ai",
      "https://0g-mainnet.drpc.org",
      "https://16661.rpc.thirdweb.com",
    ],
  },
  16602: {
    name: "galileo",
    chainId: 16602,
    evmRpc: "https://evmrpc-testnet.0g.ai",
    evmRpcFallbacks: [
      "https://0g-galileo-testnet.drpc.org",
      "https://16602.rpc.thirdweb.com",
    ],
    storageRpc: "https://indexer-storage-testnet-turbo.0g.ai",
    computeRouterUrl: "https://router-api-testnet.integratenetwork.work/v1",
    computeDefaultModel: "qwen2.5-omni",
    blockExplorer: "https://chainscan-galileo.0g.ai",
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
  // Fallback matches the env default chain (16661 Aristotle mainnet).
  return resolveNetworkUrl(
    chainId,
    ["AXIOM_EVM_RPC", "OG_RPC_URL", "RPC_URL"],
    "evmRpc",
    "https://evmrpc.0g.ai",
  );
}

// Env fallbacks (AXIOM_EVM_RPC_FALLBACKS) win over the chain registry's list;
// both are ordered — primary first semantics live in the FallbackProvider caller.
export function resolveRpcFallbackUrls(chainId?: number): string[] {
  const envVal = envVar("AXIOM_EVM_RPC_FALLBACKS");
  if (envVal) {
    return envVal
      .split(",")
      .map((url) => url.trim())
      .filter((url) => url.length > 0);
  }
  const network = chainId ? pickOGNetwork(chainId) : null;
  return [...(network?.evmRpcFallbacks ?? [])];
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

/**
 * Sanctioned browser RPC-override endpoints for a chain (OPT-11): the single
 * source the frontend allowlist reads instead of its own hardcode.
 */
export function resolveRpcAllowlist(chainId?: number): string[] {
  const network = chainId ? pickOGNetwork(chainId) : null;
  if (network?.rpcAllowlist) return [...network.rpcAllowlist];
  if (!network) return [];
  return [network.evmRpc, ...(network.evmRpcFallbacks ?? [])];
}

/** Per-chain default compute chat model (Galileo's catalog has no deepseek models). */
export function defaultChatModelForChain(chainId?: number): string {
  const network = chainId ? pickOGNetwork(chainId) : null;
  return network?.computeDefaultModel ?? MAINNET_DEFAULT_CHAT_MODEL;
}
