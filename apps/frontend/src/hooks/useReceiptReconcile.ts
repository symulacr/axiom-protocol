/*
  Receipt reconciler (C-15) — settles persisted local receipt rows against the
  chain after reload. Any row still "confirming"/"submitted" when the store
  rehydrates is re-watched with the same 120s confirmation timeout FlowPage
  uses: mined+status 1 → "confirmed", status 0 → "reverted", timeout/dropped →
  "stale" (unknown — check explorer). Mounted once in App so reconciliation
  runs regardless of which page the user reloads onto; in-session rows are
  already watched by FlowPage.confirmOnChain (the per-id latch makes the
  duplicate watch harmless and idempotent).
*/
import { useEffect, useRef } from "react";
import { usePublicClient } from "wagmi";
import type { Transaction } from "../lib/models.js";
import type { ConsoleAction } from "../lib/consoleStore.js";

/** Matches FlowPage's confirmation ceiling: dropped/replaced txs flip to
 *  "stale" instead of polling forever. */
export const RECEIPT_CONFIRM_TIMEOUT_MS = 120_000;

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

type ReceiptReader = {
  getTransactionReceipt: (args: { hash: `0x${string}` }) => Promise<{
    status: "success" | "reverted";
    blockNumber: bigint;
  } | null>;
};

/**
 * Bounded receipt wait that survives RPC tx-pool lag. viem's
 * waitForTransactionReceipt rethrows TransactionReceiptNotFoundError when the
 * node's lookup momentarily lags the broadcast (observed live on 0G Galileo —
 * the tx mines seconds later), which would falsely mark healthy txs "stale".
 * Poll getTransactionReceipt instead: not-found is transient until the
 * timeout; only the timeout itself means "unknown — check explorer".
 */
export async function waitForReceiptWithTimeout(
  publicClient: ReceiptReader,
  hash: `0x${string}`,
  timeoutMs: number = RECEIPT_CONFIRM_TIMEOUT_MS,
): Promise<{ status: "success" | "reverted"; blockNumber: bigint }> {
  const startedAt = Date.now();
  for (;;) {
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash });
      if (receipt)
        return { status: receipt.status, blockNumber: receipt.blockNumber };
    } catch {
      // Not-yet-known hash or transient RPC error — keep polling.
    }
    if (Date.now() - startedAt >= timeoutMs)
      throw new Error("confirmation timeout");
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

export function useReceiptReconcile(
  transactions: Transaction[],
  dispatch: React.Dispatch<ConsoleAction>,
): void {
  const publicClient = usePublicClient();
  const watchedRef = useRef(new Set<string>());

  useEffect(() => {
    if (!publicClient) return;
    for (const tx of transactions) {
      if (tx.state !== "confirming" && tx.state !== "submitted") continue;
      // Tick receipts are 0G storage root hashes, not chain txs — they are
      // added as "confirmed" and never reach this branch; the regex is a
      // second line of defense.
      if (!TX_HASH_RE.test(tx.hash)) continue;
      if (watchedRef.current.has(tx.id)) continue;
      watchedRef.current.add(tx.id);
      void waitForReceiptWithTimeout(publicClient, tx.hash as `0x${string}`)
        .then((receipt) =>
          dispatch({
            type: "tx-state",
            txId: tx.id,
            txState: receipt.status === "success" ? "confirmed" : "reverted",
          }),
        )
        .catch(() =>
          dispatch({ type: "tx-state", txId: tx.id, txState: "stale" }),
        );
    }
  }, [transactions, publicClient, dispatch]);
}
