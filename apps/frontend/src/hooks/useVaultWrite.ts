import { useCallback, useState } from "react";
import { useWalletClient } from "wagmi";
import { apiFetch, type EncodeResponse } from "../utils/apiFetch.js";
import { validateNumericInput } from "../utils/format.js";
import { useVaultData } from "./useVaultData.js";
import { useWriteToast } from "./useWriteToast.js";

export type VaultWriteKind = "deposit" | "withdraw";

const VAULT_WRITE: Record<
  VaultWriteKind,
  { label: string; endpoint: string; verb: string }
> = {
  deposit: { label: "Deposit", endpoint: "deposit", verb: "Deposit" },
  withdraw: { label: "Withdraw", endpoint: "withdraw", verb: "Withdraw" },
};

export function useVaultWrite(
  kind: VaultWriteKind,
  tokenId: bigint,
  onSuccess?: () => void,
) {
  const vd = useVaultData(tokenId);
  const { data: walletClient } = useWalletClient();
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { success: toastSuccess, error: toastError } = useWriteToast();

  const { label, endpoint, verb } = VAULT_WRITE[kind];

  const error = validateNumericInput(amount, {
    label,
    min: 0,
    allowDecimals: true,
    maxDecimals: 18,
    max: 1e12,
  });

  const handleSubmit = useCallback(async () => {
    if (!amount.trim() || error || !walletClient) return;
    setIsSubmitting(true);
    try {
      // Same backend encode relay as the chat deposit tool:
      // single source of truth for the vault ABI (no frontend ABI drift).
      const encoded = await apiFetch<EncodeResponse>(
        `/v1/agents/${tokenId.toString()}/${endpoint}`,
        {
          method: "POST",
          body: JSON.stringify({ amount: amount.trim() }),
        },
      );
      const hash = await walletClient.sendTransaction({
        to: encoded.to,
        data: encoded.data,
        value: BigInt(encoded.value || "0"),
        chain: walletClient.chain,
      });
      toastSuccess(`${verb} submitted (${hash.slice(0, 10)}…)`);
      setAmount("");
      await vd.refetch();
      onSuccess?.();
    } catch (err) {
      toastError(err);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    amount,
    error,
    walletClient,
    tokenId,
    endpoint,
    verb,
    vd,
    onSuccess,
    toastSuccess,
    toastError,
  ]);

  const isValid = amount.trim() !== "" && !error && Number(amount) > 0;

  return {
    amount,
    setAmount,
    isSubmitting,
    isValid,
    error,
    handleSubmit,
    vaultData: vd,
  };
}
