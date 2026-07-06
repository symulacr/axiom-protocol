import type { Provider, TransactionReceipt } from "ethers";
import { resolveBlockExplorerUrl } from "@axiom/config/networks";
import { stepResults } from "./http.js";

export function txExplorerUrl(chainId: number, txHash: string): string {
  return `${resolveBlockExplorerUrl(chainId)}/tx/${txHash}`;
}

export function addressExplorerUrl(chainId: number, address: string): string {
  return `${resolveBlockExplorerUrl(chainId)}/address/${address}`;
}

export function assertReceiptOk(
  receipt: TransactionReceipt | null | undefined,
  label: string,
): TransactionReceipt {
  if (!receipt) throw new Error(`${label}: missing transaction receipt`);
  if (receipt.status !== 1) {
    throw new Error(`${label}: transaction reverted (tx=${receipt.hash})`);
  }
  return receipt;
}

export async function assertContractDeployed(
  provider: Provider,
  address: string,
  label: string,
): Promise<void> {
  const code = await provider.getCode(address);
  if (code === "0x") {
    throw new Error(`${label}: no contract bytecode at ${address}`);
  }
}

export function recordOnChainStep(deps: {
  step: number;
  name: string;
  ok: boolean;
  summary: string;
  txHash?: string;
  blockNumber?: number;
  chainId: number;
}): void {
  const explorer =
    deps.txHash !== undefined
      ? txExplorerUrl(deps.chainId, deps.txHash)
      : undefined;
  stepResults.push({
    step: deps.step,
    name: deps.name,
    ok: deps.ok,
    summary: deps.summary,
    txHash: deps.txHash,
    blockNumber: deps.blockNumber,
    explorerUrl: explorer,
  });
  if (deps.txHash) {
    console.log(
      `          tx=${deps.txHash} block=${deps.blockNumber ?? "?"} ${explorer ?? ""}`,
    );
  }
}