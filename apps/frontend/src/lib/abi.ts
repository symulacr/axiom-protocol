import { parseAbi } from "viem";
import type { Abi } from "viem";

/** viem's ABI consumers (readContract, useReadContracts, encodeFunctionData,
 * useWriteContract, …) do NOT parse human-readable string ABIs at runtime.
 * @axiom/config/abis exports string arrays — normalize once here so every
 * viem/wagmi call site gets a parsed JSON `Abi` (passthrough when already
 * parsed). */
export function toViemAbi(abi: readonly unknown[] | Abi): Abi {
  if (abi.length > 0 && typeof abi[0] === "string") {
    return parseAbi(abi as readonly string[]);
  }
  return abi as Abi;
}
