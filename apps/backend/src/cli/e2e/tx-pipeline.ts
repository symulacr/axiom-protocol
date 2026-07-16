import type { TransactionReceipt, TransactionResponse } from "ethers";
import { waitReceiptWithRetry } from "./onchain.js";

export interface PipelinedTx {
  name: string;
  send: () => Promise<TransactionResponse>;
}

export async function pipelineWalletTxs(
  label: string,
  steps: PipelinedTx[],
): Promise<TransactionReceipt[]> {
  if (steps.length === 0) return [];
  console.log(`\n[Pipeline] ${label} (${steps.length} txs, send→batch-wait)`);
  const responses: TransactionResponse[] = [];
  for (const step of steps) {
    responses.push(await step.send());
  }
  const receipts = await Promise.all(
    responses.map((resp, i) => waitReceiptWithRetry(resp, steps[i]!.name)),
  );
  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i]!;
    console.log(
      `          ✓ ${steps[i]!.name} block=${r.blockNumber} tx=${r.hash.slice(0, 14)}…`,
    );
  }
  return receipts;
}