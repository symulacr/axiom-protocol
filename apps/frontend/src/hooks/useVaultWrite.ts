import { useCallback, useState } from "react";
import { useWalletClient } from "wagmi";
import { toast } from "sonner";
import { apiFetch, type EncodeResponse } from "../utils/apiFetch.js";
import {
  errorRefString,
  humanizeError,
  validateNumericInput,
} from "../utils/format.js";
import { useVaultData } from "./useVaultDataBatch.js";

export type VaultWriteKind = "deposit" | "withdraw";

const VAULT_WRITE: Record<
  VaultWriteKind,
  { label: string; endpoint: string; verb: string }
> = {
  deposit: { label: "Deposit", endpoint: "deposit", verb: "Deposit" },
  withdraw: { label: "Withdraw", endpoint: "withdraw", verb: "Withdraw" },
};

/** Shared write-flow toasts: success on submit + canonical humanized error toast for every write path. */
const toastSuccess = (msg: string): void => {
  toast.success(msg);
};
const toastError = (err: unknown): void => {
  const refStr = errorRefString(err);
  toast.error(humanizeError(err), refStr ? { description: refStr } : undefined);
};

/** Shared numeric rules for the amount field (deposit + withdraw alike). */
const amountRules = (label: string) => ({
  label,
  min: 0,
  allowDecimals: true,
  maxDecimals: 18,
  max: 1e12,
});

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

  const { label, endpoint, verb } = VAULT_WRITE[kind];
  const toasts = opts?.toasts !== false;
  const onSuccess = opts?.onSuccess;

  const error = validateNumericInput(amount, amountRules(label));

  const handleSubmit = useCallback(
    async (amountOverride?: string): Promise<`0x${string}` | null> => {
      const value = (amountOverride ?? amount).trim();
      const overrideError =
        amountOverride === undefined
          ? error
          : validateNumericInput(value, amountRules(label));
      if (!value || overrideError || !walletClient) return null;
      setIsSubmitting(true);
      try {
        // Same backend encode relay as the chat deposit tool — single vault ABI source, no frontend drift.
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
