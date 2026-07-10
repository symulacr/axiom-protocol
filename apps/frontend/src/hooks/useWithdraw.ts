import { useCallback, useState } from "react";
import { useChainId, useWalletClient } from "wagmi";
import { toast } from "sonner";
import { apiFetch } from "../utils/apiFetch.js";
import { humanizeError, validateNumericInput } from "../utils/format.js";
import { useVaultData } from "./useVaultData.js";

type EncodeResponse = {
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
};

export function useWithdraw(tokenId: bigint, onSuccess?: () => void) {
  const chainId = useChainId();
  const vd = useVaultData(tokenId);
  const { data: walletClient } = useWalletClient();
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const withdrawError = validateNumericInput(withdrawAmount, {
    label: "Withdraw",
    min: 0,
    allowDecimals: true,
    maxDecimals: 18,
    max: 1e12,
  });

  const handleWithdraw = useCallback(async () => {
    if (!withdrawAmount.trim() || withdrawError || !walletClient) return;
    setIsWithdrawing(true);
    try {
      const encoded = await apiFetch<EncodeResponse>(
        `/v1/agents/${tokenId.toString()}/withdraw`,
        {
          method: "POST",
          body: JSON.stringify({ amount: withdrawAmount.trim() }),
        },
      );
      const hash = await walletClient.sendTransaction({
        to: encoded.to,
        data: encoded.data,
        value: BigInt(encoded.value || "0"),
        chain: walletClient.chain,
      });
      toast.success(`Withdraw submitted (${hash.slice(0, 10)}…)`);
      setWithdrawAmount("");
      await vd.refetch();
      onSuccess?.();
    } catch (err) {
      const ref = err as { code?: string; requestId?: string } | null;
      const refStr =
        ref && (ref.code !== undefined || ref.requestId !== undefined)
          ? `Ref · ${[ref.requestId, ref.code].filter((x): x is string => x !== undefined).join(" · ")}`
          : null;
      toast.error(humanizeError(err), refStr ? { description: refStr } : undefined);
    } finally {
      setIsWithdrawing(false);
    }
  }, [withdrawAmount, withdrawError, walletClient, tokenId, vd, onSuccess, chainId]);

  const isValidWithdraw =
    withdrawAmount.trim() !== "" &&
    !withdrawError &&
    Number(withdrawAmount) > 0;

  return {
    withdrawAmount,
    setWithdrawAmount,
    isWithdrawing,
    isValidWithdraw,
    withdrawError,
    handleWithdraw,
    vaultData: vd,
  };
}