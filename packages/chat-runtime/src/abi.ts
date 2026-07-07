import { parseAbi, type Abi } from "viem";

/** Parse human-readable ABI fragments for viem readContract / multicall. */
export function humanAbi(fragments: readonly string[]): Abi {
  return parseAbi(fragments);
}