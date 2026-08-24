import { useMemo } from "react";
import { usePublicClient } from "wagmi";
import { chatToolLabels, CHAT_TOOL_CATALOG } from "@axiom/config/chat-tools";
import { runBrowserTool } from "./transport-browser.js";

export const TOOL_LABELS: Record<string, string> = chatToolLabels();

// unbroker_* skills would 403 for browser users — hidden from catalog and LLM tool list; server routes stay intact.
export const CLIENT_TOOL_CATALOG = CHAT_TOOL_CATALOG.filter(
  (t) => !t.name.startsWith("unbroker_"),
);

type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<string>;

export type ToolContext = {
  address: string | undefined;
  chainId: number;
  lastTokenId?: string;
  writeContractAsync: (args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args: unknown[];
    value?: bigint;
  }) => Promise<`0x${string}`>;
  sendTransactionAsync?: (args: {
    to: `0x${string}`;
    data?: `0x${string}`;
    value?: bigint;
  }) => Promise<`0x${string}`>;
  /** Optional receipt wait for wallet-signed tool txs; null on timeout/unavailable. */
  waitForReceipt?: (txHash: `0x${string}`) => Promise<{
    status: "success" | "reverted";
    blockNumber: bigint;
  } | null>;
  publicClient: ReturnType<typeof usePublicClient>;
  openTransfer?: (tokenId: string) => Promise<string>;
};

export const TOOLS: ToolDefinition[] = CLIENT_TOOL_CATALOG.map((t) => ({
  type: "function" as const,
  function: {
    name: t.name,
    description: t.hint,
    parameters: t.parameters ?? { type: "object", properties: {} },
  },
}));

export function useToolHandlers(ctx: ToolContext): Record<string, ToolHandler> {
  return useMemo(() => {
    const handlers: Record<string, ToolHandler> = {};
    for (const tool of TOOLS) {
      const name = tool.function.name;
      handlers[name] = async (args, c) => {
        if (name === "transfer") {
          // transfer is a UI-flow tool: reuse the TransferModal path (EIP-712 access proof + iTransferFrom), never a raw executor
          if (!c.openTransfer) {
            return JSON.stringify({
              error: "Wallet not connected — connect to transfer an agent.",
            });
          }
          const tokenId = String(args.tokenId ?? c.lastTokenId ?? "");
          if (!tokenId) {
            return JSON.stringify({
              error: "tokenId required — specify which agent to transfer.",
            });
          }
          try {
            const txHash = await c.openTransfer(tokenId);
            return JSON.stringify({ ok: true, txHash });
          } catch (err) {
            return JSON.stringify({
              ok: false,
              error: err instanceof Error ? err.message : "transfer cancelled",
            });
          }
        }
        return runBrowserTool(name, args, c);
      };
    }
    return handlers;
  }, [ctx]);
}
