import { getChatToolSpec } from "@axiom/config/chat-tools";

export type ToolCallLike = { function: { name: string } };

export function groupParallelTools<T extends ToolCallLike>(calls: T[]): T[][] {
  const batches: T[][] = [];

  for (const tc of calls) {
    if (isWalletBound(tc)) {
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

  return batches.filter((b) => b.length > 0);
}

function isWalletBound(tc: ToolCallLike): boolean {
  const spec = getChatToolSpec(tc.function.name);
  return (
    spec?.class === "encode" ||
    (spec?.class === "orchestrate" && tc.function.name === "execute_tick") ||
    (spec?.class === "skill" && spec?.requiresWallet === true)
  );
}