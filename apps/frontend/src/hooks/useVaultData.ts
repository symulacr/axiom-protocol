import { useReadContracts } from 'wagmi';
import { type Address } from 'viem';
import { getAxiomStrategyVaultAddress } from '../abi/addresses.js';
import { axiomStrategyVaultAbi } from '../abi/axiomStrategyVault.js';

export type VaultData = {
  depositsWei: bigint;
  strategyRoot: string;
  dailyLimitWei: bigint;
  isLoading: boolean;
  error: Error | null;
};

export function useVaultData(tokenId: bigint): VaultData {
  const vaultAddr = getAxiomStrategyVaultAddress();

  const query = useReadContracts({
    allowFailure: false,
    contracts: [
      {
        address: vaultAddr,
        abi: axiomStrategyVaultAbi,
        functionName: 'balanceOf',
        args: [tokenId],
      },
      {
        address: vaultAddr,
        abi: axiomStrategyVaultAbi,
        functionName: 'strategyOf',
        args: [tokenId],
      },
    ] as const,
    query: {
      enabled: tokenId > 0n,
    },
  });

  const data = query.data;
  return {
    depositsWei: data ? (data[0] as bigint) : 0n,
    strategyRoot: data ? ((data[1] as readonly [`0x${string}`, bigint, bigint, bigint])[0] as string) : '',
    dailyLimitWei: data ? ((data[1] as readonly [`0x${string}`, bigint, bigint, bigint])[1] as bigint) : 0n,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
