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

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
const AGG3 = ["function aggregate3((address,bool,bytes)[]) payable returns ((bool,bytes)[])"] as const;
const AGG3V = ["function aggregate3Value((address,bool,uint256,bytes)[]) payable returns ((bool,bytes)[])"] as const;

export function useGenericWrite() {
  const { data: walletClient } = useWalletClient();

  const write = useCallback(async (call: WriteCall): Promise<Hex> => {
    if (!walletClient) throw new Error("wallet not connected");
    const data = encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args });
    return walletClient.sendTransaction({ to: call.to, data, value: call.value ?? 0n });
  }, [walletClient]);

  const batch = useCallback(async (calls: WriteCall[]): Promise<Hex> => {
    if (!walletClient) throw new Error("wallet not connected");
    const totalValue = calls.reduce((s, c) => s + (c.value ?? 0n), 0n);
    const hasValue = totalValue > 0n;
    const call3s = calls.map(c => ({
      target: c.to, allowFailure: false,
      ...(hasValue ? { value: c.value ?? 0n } : {}),
      callData: encodeFunctionData({ abi: c.abi, functionName: c.functionName, args: c.args }),
    }));
    const func = hasValue ? "aggregate3Value" : "aggregate3";
    const abi = hasValue ? AGG3V : AGG3;
    const data = encodeFunctionData({ abi, functionName: func, args: [call3s] });
    return walletClient.sendTransaction({ to: MULTICALL3, data, value: hasValue ? totalValue : 0n });
  }, [walletClient]);

  return { write, batch };
}
