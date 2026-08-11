import { useCallback, useState } from "react";
import { useWalletClient } from "wagmi";
import { apiFetch, type EncodeResponse } from "../utils/apiFetch.js";
import { validateNumericInput } from "../utils/format.js";
import { useVaultData } from "./useVaultData.js";
import { useWriteToast } from "./useWriteToast.js";

export function useDeposit(tokenId: bigint, onSuccess?: () => void) {
  const vd = useVaultData(tokenId);
  const { data: walletClient } = useWalletClient();
  const [depositAmount, setDepositAmount] = useState("");
  const [isDepositing, setIsDepositing] = useState(false);
  const { success: toastSuccess, error: toastError } = useWriteToast();

  const depositError = validateNumericInput(depositAmount, {
    label: "Deposit",
    min: 0,
    allowDecimals: true,
    maxDecimals: 18,
    max: 1e12,
  });

  const handleDeposit = useCallback(async () => {
    if (!depositAmount.trim() || depositError || !walletClient) return;
    setIsDepositing(true);
    try {
      // Same backend encode relay as withdraw and the chat deposit tool:
      // single source of truth for the vault ABI (no frontend ABI drift).
      const encoded = await apiFetch<EncodeResponse>(
        `/v1/agents/${tokenId.toString()}/deposit`,
        {
          method: "POST",
          body: JSON.stringify({ amount: depositAmount.trim() }),
        },
      );
      const hash = await walletClient.sendTransaction({
        to: encoded.to,
        data: encoded.data,
        value: BigInt(encoded.value || "0"),
        chain: walletClient.chain,
      });
      toastSuccess(`Deposit submitted (${hash.slice(0, 10)}…)`);
      setDepositAmount("");
      await vd.refetch();
      onSuccess?.();
    } catch (err) {
      toastError(err);
    } finally {
      setIsDepositing(false);
    }
  }, [
    depositAmount,
    depositError,
    walletClient,
    tokenId,
    vd,
    onSuccess,
    toastSuccess,
    toastError,
  ]);

  const isValidDeposit =
    depositAmount.trim() !== "" && !depositError && Number(depositAmount) > 0;

  return {
    depositAmount,
    setDepositAmount,
    isDepositing,
    isValidDeposit,
    handleDeposit,
    vaultData: vd,
  };
}
