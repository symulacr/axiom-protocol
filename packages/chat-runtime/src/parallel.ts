import { getChatToolSpec } from "@axiom/config/chat-tools";

export type ToolCallLike = { function: { name: string } };

/** Group tool calls into parallel-safe batches (encode/orchestrate sign lane stays serial). */
export function groupParallelTools<T extends ToolCallLike>(calls: T[]): T[][] {
  const batches: T[][] = [];
  let walletLane: T[] = [];

  for (const tc of calls) {
    const spec = getChatToolSpec(tc.function.name);
    const walletBound =
      spec?.class === "encode" ||
      (spec?.class === "orchestrate" && tc.function.name === "execute_tick");

    if (walletBound) {
      if (walletLane.length > 0) {
        batches.push(walletLane);
        walletLane = [];
      }
      batches.push([tc]);
    } else {
      const last = batches[batches.length - 1];
      if (last && last.length > 0 && !isWalletBound(last[0]!)) {
        last.push(tc);
      } else {
        batches.push([tc]);
      }
    }
  }

  if (walletLane.length > 0) batches.push(walletLane);
  return batches.filter((b) => b.length > 0);
}

function isWalletBound(tc: ToolCallLike): boolean {
  const spec = getChatToolSpec(tc.function.name);
  return (
    spec?.class === "encode" ||
    (spec?.class === "orchestrate" && tc.function.name === "execute_tick")
  );
}