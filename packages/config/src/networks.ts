import { getEnvWithAlias } from "./env.js";

/** 0G network entry for a given chainId. */
export interface OGNetwork {
  readonly name: "galileo" | "aristotle";
  readonly chainId: number;
  readonly evmRpc: string;
  readonly storageRpc: string;
  readonly flowContract: `0x${string}`;
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
  },
  16661: {
    name: "aristotle",
    chainId: 16661,
    evmRpc: "https://evmrpc.0g.ai",
    storageRpc: "https://indexer-storage-turbo.0g.ai",
    flowContract: "0x62D4144dB0F0a6fBBaeb6296c785C71B3D57C526",
  },
} as const satisfies Record<number, OGNetwork>;

/** OG_NETWORKS map cast to Record<number, OGNetwork> for type inference. */
export const OG_NETWORKS: Record<number, OGNetwork> = _OG_NETWORKS as unknown as Record<number, OGNetwork>;

/** Look up the canonical 0G network entry for a chainId, or null if unsupported. */
export function pickOGNetwork(chainId: number): OGNetwork | null {
  return OG_NETWORKS[chainId] ?? null;
}

/** Resolve EVM RPC URL from env or network default. Precedence: AXIOM_EVM_RPC → OG_RPC_URL → RPC_URL → chain default → Galileo fallback. */
export function resolveRpcUrl(chainId?: number): string {
  const varVal = getEnvWithAlias("AXIOM_EVM_RPC", ["OG_RPC_URL", "RPC_URL"]);
  if (varVal) return varVal;
  const network = chainId ? pickOGNetwork(chainId) : null;
  return network?.evmRpc ?? "https://evmrpc-testnet.0g.ai";
}

/** Resolve Storage RPC URL from env or network default. Precedence: AXIOM_STORAGE_RPC → OG_STORAGE_RPC → chain default → Galileo fallback. */
export function resolveStorageRpc(chainId?: number): string {
  const varVal = getEnvWithAlias("AXIOM_STORAGE_RPC", ["OG_STORAGE_RPC"]);
  if (varVal) return varVal;
  const network = chainId ? pickOGNetwork(chainId) : null;
  return network?.storageRpc ?? "https://indexer-storage-testnet-turbo.0g.ai";
}
