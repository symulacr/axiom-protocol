import { useCallback, useState } from "react";
import { useChainId, useWriteContract } from "wagmi";
import { parseAbi, parseEther } from "viem";
import { toast } from "sonner";
import { getAxiomStrategyVaultAddress } from "../abi/addresses.js";
import { axiomStrategyVaultAbi } from "../abi/axiomStrategyVault.js";
import { useVaultData } from "./useVaultData.js";
import { humanizeError } from "../utils/format.js";

const abi = parseAbi(axiomStrategyVaultAbi);

export function useDeposit(tokenId: bigint, onSuccess?: () => void) {
  const chainId = useChainId();
  const vd = useVaultData(tokenId);
  const vaultAddr = getAxiomStrategyVaultAddress(chainId);
  const [depositAmount, setDepositAmount] = useState("");

  const { writeContract: doDeposit, isPending: isDepositing } =
    useWriteContract({
      mutation: {
        onSuccess() {
          toast.success("Deposit successful");
          setDepositAmount("");
          vd.refetch();
          onSuccess?.();
        },
        onError(err) {
          const ref = err as { code?: string; requestId?: string } | null;
          const refStr =
            ref && (ref.code !== undefined || ref.requestId !== undefined)
              ? `Ref · ${[ref.requestId, ref.code].filter((x): x is string => x !== undefined).join(" · ")}`
              : null;
          toast.error(humanizeError(err), refStr ? { description: refStr } : undefined);
        },
      },
    });

  const handleDeposit = useCallback(() => {
    if (!depositAmount) return;
    let value: bigint;
    try {
      value = parseEther(depositAmount);
    } catch {
      toast.error("Amount too large or invalid");
      return;
    }
    doDeposit({
      address: vaultAddr,
      abi,
      functionName: "deposit",
      args: [tokenId],
      value,
    });
  }, [chainId, depositAmount, vaultAddr, tokenId, doDeposit]);

  const isValidDeposit =
    depositAmount.trim() !== "" &&
    !isNaN(Number(depositAmount)) &&
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
