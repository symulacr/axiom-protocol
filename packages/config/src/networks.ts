export interface OGNetwork {
  readonly name: "galileo" | "aristotle";
  readonly chainId: number;
  readonly evmRpc: string;
  readonly storageRpc: string;
  readonly flowContract: `0x${string}`;

  readonly computeRouterUrl: string;
  readonly computeDirectProxyUrl: string;
  readonly daGrpcUrl: string;
  readonly blockExplorer: string;
  readonly explorerApiUrl: string;
}

export const GALILEO_CHAIN_ID = 16602;
export const ARISTOTLE_CHAIN_ID = 16661;

const _OG_NETWORKS = {
  16602: {
    name: "galileo",
    chainId: 16602,
    evmRpc: "https://evmrpc-testnet.0g.ai",
    storageRpc: "https://indexer-storage-testnet-turbo.0g.ai",
    flowContract: "0x22E03a6A89B950F1c82ec5e74F8eCa321a105296",
    computeRouterUrl: "https://router-api-testnet.integratenetwork.work/v1",
    computeDirectProxyUrl: "https://compute-network-6.integratenetwork.work/v1/proxy",
    daGrpcUrl: "dgrpc-testnet.0g.ai:9090",
    blockExplorer: "https://chainscan-galileo.0g.ai",
    explorerApiUrl: "https://chainscan-galileo.0g.ai/api",
  },
  16661: {
    name: "aristotle",
    chainId: 16661,
    evmRpc: "https://evmrpc.0g.ai",
    storageRpc: "https://indexer-storage-turbo.0g.ai",
    flowContract: "0x62D4144dB0F0a6fBBaeb6296c785C71B3D57C526",
    computeRouterUrl: "https://router-api.0g.ai/v1",
    computeDirectProxyUrl: "https://compute-network-6.integratenetwork.work/v1/proxy",
    daGrpcUrl: "dgrpc.0g.ai:9090",
    blockExplorer: "https://chainscan.0g.ai",
    explorerApiUrl: "https://chainscan.0g.ai/api",
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
