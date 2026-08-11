import { useCallback, useState } from "react";
import { useChainId } from "wagmi";
import { parseEther } from "viem";
import { getAxiomStrategyVaultAddress } from "../abi/addresses.js";
import { VAULT_ABI } from "@axiom/config/abis";
import { useVaultData } from "./useVaultData.js";
import { useGenericWrite } from "./useGenericWrite.js";
import { useWriteToast } from "./useWriteToast.js";

const abi = VAULT_ABI;

export function useDeposit(tokenId: bigint, onSuccess?: () => void) {
  const chainId = useChainId();
  const vd = useVaultData(tokenId);
  const vaultAddr = getAxiomStrategyVaultAddress(chainId);
  const [depositAmount, setDepositAmount] = useState("");

  const { write } = useGenericWrite();
  const { success: toastSuccess, error: toastError } = useWriteToast();
  const [isDepositing, setIsDepositing] = useState(false);

  const handleDeposit = useCallback(() => {
    if (!depositAmount) return;
    let value: bigint;
    try {
      value = parseEther(depositAmount);
    } catch {
      toastError("Amount too large or invalid");
      return;
    }
    setIsDepositing(true);
    write({
      to: vaultAddr,
      abi,
      functionName: "deposit",
      args: [tokenId],
      value,
    })
      .then(() => {
        toastSuccess("Deposit successful");
        setDepositAmount("");
        vd.refetch();
        onSuccess?.();
      })
      .catch(toastError)
      .finally(() => setIsDepositing(false));
  }, [
    vaultAddr,
    abi,
    tokenId,
    depositAmount,
    write,
    vd.refetch,
    onSuccess,
    toastError,
    toastSuccess,
  ]);

  const isValidDeposit =
    depositAmount.trim() !== "" &&
    Number.isFinite(Number(depositAmount)) &&
    Number(depositAmount) > 0;

  return {
    depositAmount,
    setDepositAmount,
    isDepositing,
    isValidDeposit,
    handleDeposit,
    vaultData: vd,
  };
}
