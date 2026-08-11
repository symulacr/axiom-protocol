import { useCallback, useState } from "react";
import { useChainId } from "wagmi";
import { parseEther } from "viem";
import { toast } from "sonner";
import { getAxiomStrategyVaultAddress } from "../abi/addresses.js";
import { VAULT_ABI } from "@axiom/config/abis";
import { useVaultData } from "./useVaultData.js";
import { errorRefString, humanizeError } from "../utils/format.js";
import { useGenericWrite } from "./useGenericWrite.js";

const abi = VAULT_ABI;

export function useDeposit(tokenId: bigint, onSuccess?: () => void) {
  const chainId = useChainId();
  const vd = useVaultData(tokenId);
  const vaultAddr = getAxiomStrategyVaultAddress(chainId);
  const [depositAmount, setDepositAmount] = useState("");

  const { write } = useGenericWrite();
  const [isDepositing, setIsDepositing] = useState(false);

  const handleDeposit = useCallback(() => {
    if (!depositAmount) return;
    let value: bigint;
    try {
      value = parseEther(depositAmount);
    } catch {
      toast.error("Amount too large or invalid");
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
        toast.success("Deposit successful");
        setDepositAmount("");
        vd.refetch();
        onSuccess?.();
      })
      .catch((err) => {
        const refStr = errorRefString(err);
        toast.error(
          humanizeError(err),
          refStr ? { description: refStr } : undefined,
        );
      })
      .finally(() => setIsDepositing(false));
  }, [vaultAddr, abi, tokenId, depositAmount, write, vd.refetch, onSuccess]);

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
