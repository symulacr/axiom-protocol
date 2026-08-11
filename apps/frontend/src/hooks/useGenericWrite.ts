import { useWalletClient } from "wagmi";
import { encodeFunctionData, type Hex } from "viem";
import { useCallback } from "react";

interface WriteCall {
  to: Hex;
  abi: readonly unknown[];
  functionName: string;
  args: readonly unknown[];
  value?: bigint;
}

export function useGenericWrite() {
  const { data: walletClient } = useWalletClient();

  const write = useCallback(
    async (call: WriteCall): Promise<Hex> => {
      if (!walletClient) throw new Error("wallet not connected");
      const data = encodeFunctionData({
        abi: call.abi,
        functionName: call.functionName,
        args: call.args,
      });
      return walletClient.sendTransaction({
        to: call.to,
        data,
        value: call.value ?? 0n,
      });
    },
    [walletClient],
  );

  return { write };
}
