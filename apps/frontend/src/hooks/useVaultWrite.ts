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
  opts?: {
    onSuccess?: () => void;
    /** Default true: toast on submit/error and swallow errors. Flow pages pass
     * false so the OperationReviewSheet machine (submitting →
     * recoverable-error → receipt) owns the UX instead of toasts; in that
     * mode handleSubmit rethrows and resolves to the tx hash. */
    toasts?: boolean;
  },
) {
  const vd = useVaultData(tokenId);
  const { data: walletClient } = useWalletClient();
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { success: toastSuccess, error: toastError } = useWriteToast();

  const { label, endpoint, verb } = VAULT_WRITE[kind];
  const toasts = opts?.toasts !== false;
  const onSuccess = opts?.onSuccess;

  const error = validateNumericInput(amount, {
    label,
    min: 0,
    allowDecimals: true,
    maxDecimals: 18,
    max: 1e12,
  });

  const handleSubmit = useCallback(
    async (amountOverride?: string): Promise<`0x${string}` | null> => {
      const value = (amountOverride ?? amount).trim();
      const overrideError =
        amountOverride === undefined
          ? error
          : validateNumericInput(value, {
              label,
              min: 0,
              allowDecimals: true,
              maxDecimals: 18,
              max: 1e12,
            });
      if (!value || overrideError || !walletClient) return null;
      setIsSubmitting(true);
      try {
        // Same backend encode relay as the chat deposit tool:
        // single source of truth for the vault ABI (no frontend ABI drift).
        const encoded = await apiFetch<EncodeResponse>(
          `/v1/agents/${tokenId.toString()}/${endpoint}`,
          {
            method: "POST",
            body: JSON.stringify({ amount: value }),
          },
        );
        const hash = await walletClient.sendTransaction({
          to: encoded.to,
          data: encoded.data,
          value: BigInt(encoded.value || "0"),
          chain: walletClient.chain,
        });
        if (toasts) toastSuccess(`${verb} submitted (${hash.slice(0, 10)}…)`);
        setAmount("");
        await vd.refetch();
        onSuccess?.();
        return hash;
      } catch (err) {
        if (toasts) {
          toastError(err);
          return null;
        }
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      amount,
      error,
      label,
      walletClient,
      tokenId,
      endpoint,
      verb,
      vd,
      onSuccess,
      toasts,
      toastSuccess,
      toastError,
    ],
  );

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
