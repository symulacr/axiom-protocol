import { useVaultDataBatch } from "./useVaultDataBatch.js";

export type VaultData = {
  depositsWei: bigint | undefined;
  strategyRoot: string;
  dailyLimitWei: bigint;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
};

export function useVaultData(tokenId: bigint): VaultData {
  const result = useVaultDataBatch(tokenId > 0n ? [tokenId] : []);
  const entry = result.data.get(tokenId.toString());

  return {
    depositsWei: result.error !== null ? undefined : (entry?.depositsWei ?? 0n),
    strategyRoot: entry?.strategyRoot ?? "",
    dailyLimitWei: entry?.dailyLimitWei ?? 0n,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}
