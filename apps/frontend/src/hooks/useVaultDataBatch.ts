import { useMemo } from "react";
import { useAccount, useChainId, useReadContracts } from "wagmi";
import { parseAbi } from "viem";
import { getAxiomStrategyVaultAddress } from "../abi/addresses.js";
import { axiomStrategyVaultAbi } from "../abi/axiomStrategyVault.js";

const abi = parseAbi(axiomStrategyVaultAbi);

export interface VaultDataEntry {
  tokenId: bigint;
  depositsWei: bigint;
  strategyRoot: string;
  dailyLimitWei: bigint;
  readError?: string | null;
}


export function useVaultDataBatch(tokenIds: readonly bigint[]): {
  data: Map<string, VaultDataEntry>;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const vaultAddr = getAxiomStrategyVaultAddress(chainId);

  const contracts = useMemo(() => {
    return tokenIds.flatMap((tokenId) => [
      {
        address: vaultAddr,
        abi,
        functionName: "balanceOf" as const,
        args: [tokenId] as const,
      },
      {
        address: vaultAddr,
        abi,
        functionName: "strategyOf" as const,
        args: [tokenId] as const,
      },
    ]);
  }, [tokenIds, vaultAddr]);

  const query = useReadContracts({
    allowFailure: true,
    contracts,
    query: {
      staleTime: 30_000,
      enabled: isConnected && tokenIds.length > 0,
    },
  });

  const data = useMemo(() => {
    const map = new Map<string, VaultDataEntry>();
    for (let i = 0; i < tokenIds.length; i++) {
      const tokenId = tokenIds[i];
      if (tokenId === undefined) continue;
      const balanceResult = query.data?.[i * 2];
      const strategyResult = query.data?.[i * 2 + 1];

      let depositsWei = 0n;
      let readError: string | null = null;

      if (balanceResult?.status === "failure") {
        readError = balanceResult.error.message;
      } else if (
        balanceResult &&
        balanceResult.status === "success" &&
        balanceResult.result !== undefined
      ) {
        depositsWei = balanceResult.result as bigint;
      }

      let strategyRoot = "";
      let dailyLimitWei = 0n;
      if (strategyResult?.status === "failure") {
        const strategyErr = strategyResult.error.message;
        readError = readError ? `${readError}; ${strategyErr}` : strategyErr;
      } else if (
        strategyResult &&
        strategyResult.status === "success" &&
        strategyResult.result !== undefined
      ) {
        const strategy = strategyResult.result as readonly [
          `0x${string}`,
          bigint,
          bigint,
          bigint,
          bigint,
        ];
        strategyRoot = strategy[0] as string;
        dailyLimitWei = strategy[1] as bigint;
      }

      map.set(tokenId.toString(), {
        tokenId,
        depositsWei,
        strategyRoot,
        dailyLimitWei,
        ...(readError ? { readError } : {}),
      });
    }
    return map;
  }, [tokenIds, query.data]);

  const aggregateError = useMemo((): Error | null => {
    if (query.error) {
      return query.error as Error;
    }
    for (const entry of data.values()) {
      if (entry.readError) {
        return new Error(entry.readError);
      }
    }
    return null;
  }, [data, query.error]);

  const refetch = query.refetch;
  const result = useMemo(
    () => ({
      data,
      isLoading: query.isLoading,
      error: aggregateError,
      refetch: () => {
        refetch();
      },
    }),
    [data, query.isLoading, aggregateError, refetch],
  );

  return result;
}
