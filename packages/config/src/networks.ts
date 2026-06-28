export interface OGNetwork {
  readonly name: "galileo" | "aristotle";
  readonly chainId: number;
  readonly evmRpc: string;
  readonly storageRpc: string;
  readonly computeRouterUrl: string;
  readonly blockExplorer: string;
}

export const GALILEO_CHAIN_ID = 16602;
export const ARISTOTLE_CHAIN_ID = 16661;

const _OG_NETWORKS = {
  16602: {
    name: "galileo",
    chainId: 16602,
    evmRpc: "https://evmrpc-testnet.0g.ai",
    storageRpc: "https://indexer-storage-testnet-turbo.0g.ai",
    computeRouterUrl: "https://router-api-testnet.integratenetwork.work/v1",
    blockExplorer: "https://chainscan-galileo.0g.ai",
  },
  16661: {
    name: "aristotle",
    chainId: 16661,
    evmRpc: "https://evmrpc.0g.ai",
    storageRpc: "https://indexer-storage-turbo.0g.ai",
    computeRouterUrl: "https://router-api.0g.ai/v1",
    blockExplorer: "https://chainscan.0g.ai",
  },
} as const satisfies Record<number, OGNetwork>;

export const OG_NETWORKS: Record<number, OGNetwork> = _OG_NETWORKS as unknown as Record<number, OGNetwork>;

export function pickOGNetwork(chainId: number): OGNetwork | null {
  return OG_NETWORKS[chainId] ?? null;
}

/** Precedence: AXIOM_EVM_RPC → OG_RPC_URL → RPC_URL → chain default → Galileo fallback. */
export function resolveRpcUrl(chainId?: number): string {
  const varVal = process.env.AXIOM_EVM_RPC || process.env.OG_RPC_URL || process.env.RPC_URL;
  if (varVal) return varVal;
  const network = chainId ? pickOGNetwork(chainId) : null;
  return network?.evmRpc ?? "https://evmrpc-testnet.0g.ai";
}

/** Precedence: AXIOM_STORAGE_RPC → OG_STORAGE_RPC → chain default → Galileo fallback. */
export function resolveStorageRpc(chainId?: number): string {
  const varVal = process.env.AXIOM_STORAGE_RPC || process.env.OG_STORAGE_RPC;
  if (varVal) return varVal;
  const network = chainId ? pickOGNetwork(chainId) : null;
  return network?.storageRpc ?? "https://indexer-storage-testnet-turbo.0g.ai";
}

export function resolveBlockExplorerUrl(chainId?: number): string {
  const network = chainId ? pickOGNetwork(chainId) : null;
  return network?.blockExplorer ?? "https://chainscan-galileo.0g.ai";
}
