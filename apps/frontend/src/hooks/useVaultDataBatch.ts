import { useChainId, useReadContracts } from 'wagmi';
import { parseAbi } from 'viem';
import { getAxiomStrategyVaultAddress } from '../abi/addresses.js';
import { axiomStrategyVaultAbi } from '../abi/axiomStrategyVault.js';

const abi = parseAbi(axiomStrategyVaultAbi);

export interface VaultDataEntry {
  tokenId: bigint;
  depositsWei: bigint;
  strategyRoot: string;
  dailyLimitWei: bigint;
}

/**
 * Batch-fetch vault data for multiple token IDs in a single multicall.
 * Replaces N individual useVaultData calls with one useReadContracts call.
 */
export function useVaultDataBatch(tokenIds: readonly bigint[]): {
  data: Map<string, VaultDataEntry>;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const chainId = useChainId();
  const vaultAddr = getAxiomStrategyVaultAddress(chainId);

  // Build multicall: 2 calls per token (balanceOf + strategyOf)
  const contracts = tokenIds.flatMap((tokenId) => [
    {
      address: vaultAddr,
      abi,
      functionName: 'balanceOf' as const,
      args: [tokenId] as const,
    },
    {
      address: vaultAddr,
      abi,
      functionName: 'strategyOf' as const,
      args: [tokenId] as const,
    },
  ]);

  const query = useReadContracts({
    contracts,
    query: {
      staleTime: 30_000,
      enabled: tokenIds.length > 0,
    },
  });

  const data = new Map<string, VaultDataEntry>();
  for (let i = 0; i < tokenIds.length; i++) {
    const tokenId = tokenIds[i];
    if (tokenId === undefined) continue;
    const balanceResult = query.data?.[i * 2];
    const strategyResult = query.data?.[i * 2 + 1];

    let depositsWei = 0n;
    if (balanceResult && balanceResult.status === 'success' && balanceResult.result !== undefined) {
      depositsWei = balanceResult.result as bigint;
    }

    let strategyRoot = '';
    let dailyLimitWei = 0n;
    if (strategyResult && strategyResult.status === 'success' && strategyResult.result !== undefined) {
      const strategy = strategyResult.result as readonly [`0x${string}`, bigint, bigint, bigint];
      strategyRoot = strategy[0] as string;
      dailyLimitWei = strategy[1] as bigint;
    }

    data.set(tokenId.toString(), { tokenId, depositsWei, strategyRoot, dailyLimitWei });
  }

  return {
    data,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: () => { query.refetch(); },
  };
}
