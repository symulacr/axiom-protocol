export interface OGNetwork {
  readonly name: string;
  readonly chainId: number;
  readonly evmRpc: string;
  readonly storageRpc: string;
  readonly computeRouterUrl: string;
  readonly blockExplorer: string;
}

export const ARISTOTLE_CHAIN_ID = 16661;

// Static network registry — the URLs ARE the config data (not request targets).
const _OG_NETWORKS = {
  16661: {
    name: "aristotle",
    chainId: 16661,
    evmRpc: "https://evmrpc.0g.ai",
    storageRpc: "https://indexer-storage-turbo.0g.ai",
    computeRouterUrl: "https://router-api.0g.ai/v1",
    blockExplorer: "https://chainscan.0g.ai",
  },
  16602: {
    name: "galileo",
    chainId: 16602,
    evmRpc: "https://evmrpc-testnet.0g.ai",
    storageRpc: "https://indexer-storage-testnet-turbo.0g.ai",
    computeRouterUrl: "https://router-api-testnet.0g.ai/v1",
    blockExplorer: "https://chainscan-testnet.0g.ai",
  },
} as const satisfies Record<number, OGNetwork>;

export const OG_NETWORKS: Record<number, OGNetwork> =
  _OG_NETWORKS as unknown as Record<number, OGNetwork>;

export function pickOGNetwork(chainId: number): OGNetwork | null {
  return OG_NETWORKS[chainId] ?? null;
}

// Browser-safe guard: `process` is undefined in bundles; typeof avoids ReferenceError.
function envVar(...keys: string[]): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  for (const key of keys) {
    const val = process.env[key];
    if (val) return val;
  }
  return undefined;
}

export function resolveRpcUrl(chainId?: number): string {
  const varVal = envVar("AXIOM_EVM_RPC", "OG_RPC_URL", "RPC_URL");
  if (varVal) return varVal;
  const network = chainId ? pickOGNetwork(chainId) : null;
  return network?.evmRpc ?? "https://evmrpc.0g.ai";
}

export function resolveStorageRpc(chainId?: number): string {
  const varVal = envVar("AXIOM_STORAGE_RPC", "OG_STORAGE_RPC");
  if (varVal) return varVal;
  const network = chainId ? pickOGNetwork(chainId) : null;
  return network?.storageRpc ?? "https://indexer-storage-turbo.0g.ai";
}

export function resolveBlockExplorerUrl(chainId?: number): string {
  const network = chainId ? pickOGNetwork(chainId) : null;
  return network?.blockExplorer ?? "https://chainscan.0g.ai";
}

import { zeroGMainnet as _viemZeroGMainnet } from "viem/chains";

/** 0G Mainnet chain (viem built-in) with dynamic RPC override for env-based endpoint selection. */
export const zeroGMainnet = {
  ..._viemZeroGMainnet,
  rpcUrls: { default: { http: [resolveRpcUrl()] } },
  contracts: {
    ..._viemZeroGMainnet.contracts,
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
      blockCreated: 0,
    },
  },
};
