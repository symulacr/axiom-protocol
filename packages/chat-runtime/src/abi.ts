import { parseAbi, type Abi } from "viem";

export function humanAbi(fragments: readonly string[]): Abi {
  return parseAbi(fragments);
}