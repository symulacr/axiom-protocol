import { useVaultDataBatch } from "./useVaultDataBatch.js";

type VaultData = {
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
