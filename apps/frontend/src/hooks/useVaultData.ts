import { useMemo } from "react";
import { useChainId, useReadContracts } from "wagmi";
import { parseAbi } from "viem";
import { getAxiomStrategyVaultAddress } from "../abi/addresses.js";
import { axiomStrategyVaultAbi } from "../abi/axiomStrategyVault.js";

const axiomStrategyVaultAbiParsed = parseAbi(axiomStrategyVaultAbi);

type StrategyOfTuple = readonly [
  `0x${string}`,
  bigint,
  bigint,
  bigint,
  bigint,
];

export type VaultData = {
  depositsWei: bigint;
  strategyRoot: string;
  dailyLimitWei: bigint;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
};

export function useVaultData(tokenId: bigint): VaultData {
  const chainId = useChainId();
  const vaultAddr = getAxiomStrategyVaultAddress(chainId);

  const contracts = useMemo(
    () =>
      [
        {
          address: vaultAddr,
          abi: axiomStrategyVaultAbiParsed,
          functionName: "balanceOf",
          args: [tokenId],
        },
        {
          address: vaultAddr,
          abi: axiomStrategyVaultAbiParsed,
          functionName: "strategyOf",
          args: [tokenId],
        },
      ] as const,
    [tokenId, vaultAddr],
  );

  const query = useReadContracts({
    allowFailure: false,
    contracts,
    query: {
      staleTime: 30_000,
      enabled: tokenId > 0n,
    },
  });

  const data = query.data;
  const depositsWei = data ? (data[0] as bigint) : 0n;
  const strategyRoot = data
    ? ((data[1] as StrategyOfTuple)[0] as string)
    : "";
  const dailyLimitWei = data ? (data[1] as StrategyOfTuple)[1] : 0n;
  const refetch = query.refetch;

  const result = useMemo(
    () => ({
      depositsWei,
      strategyRoot,
      dailyLimitWei,
      isLoading: query.isLoading,
      error: query.error as Error | null,
      refetch: () => {
        refetch();
      },
    }),
    [
      depositsWei,
      strategyRoot,
      dailyLimitWei,
      query.isLoading,
      query.error,
      refetch,
    ],
  );

  return result;
}
