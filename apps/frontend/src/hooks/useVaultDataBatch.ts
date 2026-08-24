import { useMemo } from "react";
import { useAccount, useChainId, useReadContracts } from "wagmi";
import { getAxiomStrategyVaultAddress } from "../abi/addresses.js";
import { VAULT_ABI } from "@axiom/config/abis";
import { toViemAbi } from "../lib/abi.js";

const abi = toViemAbi(VAULT_ABI);

/** Unpack one multicall result as [errorMessage, value]; undefined value =
 * call reverted or hasn't resolved — caller keeps its default. */
function unpackContractResult(
  result:
    | { status: "failure"; error: Error }
    | { status: "success"; result?: unknown }
    | undefined,
): [string | null, unknown] {
  if (!result) return [null, undefined];
  if (result.status === "failure") return [result.error.message, undefined];
  return [null, result.result];
}

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

      const [balanceError, balance] = unpackContractResult(query.data?.[i * 2]);
      const [strategyError, strategy] = unpackContractResult(
        query.data?.[i * 2 + 1],
      );
      let readError: string | null = balanceError;
      if (strategyError)
        readError = readError
          ? `${readError}; ${strategyError}`
          : strategyError;

      const strategyTuple = strategy as
        readonly [`0x${string}`, bigint, bigint, bigint, bigint] | undefined;

      map.set(tokenId.toString(), {
        tokenId,
        depositsWei: (balance as bigint | undefined) ?? 0n,
        strategyRoot: strategyTuple ? (strategyTuple[0] as string) : "",
        dailyLimitWei: strategyTuple ? strategyTuple[1] : 0n,
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

  return useMemo(
    () => ({
      data,
      isLoading: query.isLoading,
      error: aggregateError,
      refetch: () => {
        query.refetch();
      },
    }),
    [data, query.isLoading, aggregateError, query.refetch],
  );
}

export type VaultData = {
  depositsWei: bigint | undefined;
  strategyRoot: string;
  refetch: () => void;
};

export function useVaultData(tokenId: bigint): VaultData {
  const result = useVaultDataBatch(tokenId > 0n ? [tokenId] : []);
  const entry = result.data.get(tokenId.toString());

  return {
    depositsWei: result.error !== null ? undefined : (entry?.depositsWei ?? 0n),
    strategyRoot: entry?.strategyRoot ?? "",
    refetch: result.refetch,
  };
}
