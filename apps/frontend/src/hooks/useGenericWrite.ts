import { useWalletClient } from "wagmi";
import { encodeFunctionData, parseAbi, type Abi, type Hex } from "viem";
import { useCallback } from "react";

interface WriteCall {
  to: Hex;
  abi: readonly unknown[] | Abi;
  functionName: string;
  args: readonly unknown[];
  value?: bigint;
}

/** viem's encodeFunctionData does NOT parse human-readable string ABIs at
 *  runtime — normalize like transport-browser.toViemAbi (config ABIs are
 *  string arrays). */
function normalizeAbi(abi: readonly unknown[] | Abi): Abi {
  if (abi.length > 0 && typeof abi[0] === "string") {
    return parseAbi(abi as readonly string[]);
  }
  return abi as Abi;
}

export function useGenericWrite() {
  const { data: walletClient } = useWalletClient();

  const write = useCallback(
    async (call: WriteCall): Promise<Hex> => {
      if (!walletClient) throw new Error("wallet not connected");
      const data = encodeFunctionData({
        abi: normalizeAbi(call.abi),
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
