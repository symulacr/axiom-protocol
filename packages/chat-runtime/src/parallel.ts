import { getChatToolSpec } from "@axiom/config/chat-tools";

export type ToolCallLike = { function: { name: string } };

export function groupParallelTools<T extends ToolCallLike>(calls: T[]): T[][] {
  const batches: T[][] = [];
  let open: T[] | null = null;

  for (const tc of calls) {
    if (isWalletBound(tc)) {
      if (open && open.length) {
        batches.push(open);
        open = null;
      }
      batches.push([tc]);
    } else {
      if (!open) open = [];
      open.push(tc);
    }
  }
  if (open && open.length) batches.push(open);

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