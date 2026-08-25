import type { TransactionReceipt, TransactionResponse } from "ethers";
import { waitReceiptWithRetry } from "./onchain.js";

interface PipelinedTx {
  name: string;
  send: () => Promise<TransactionResponse>;
}

export async function pipelineWalletTxs(
  label: string,
  steps: PipelinedTx[],
  opts: { sequential?: boolean } = {},
): Promise<TransactionReceipt[]> {
  if (steps.length === 0) return [];
  const mode = opts.sequential ? "send→wait per step" : "send→batch-wait";
  console.log(`\n[Pipeline] ${label} (${steps.length} txs, ${mode})`);
  if (opts.sequential) {
    // Dependent steps (e.g. authorize must mine before revoke): send + wait each in order.
    const receipts: TransactionReceipt[] = [];
    for (const step of steps) {
      const resp = await step.send();
      const r = await waitReceiptWithRetry(resp, step.name);
      console.log(
        `          ✓ ${step.name} block=${r.blockNumber} tx=${r.hash.slice(0, 14)}…`,
      );
      receipts.push(r);
    }
    return receipts;
  }
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
