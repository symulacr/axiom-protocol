import { useMemo } from "react";
import { usePublicClient } from "wagmi";
import { formatToolResult as formatToolResultRuntime } from "@axiom/chat-runtime";
import {
  chatToolLabels,
  CHAT_TOOL_CATALOG,
  classOfTool,
  CHAT_TOOL_CLASS_LABELS,
  getChatToolSpec,
  type ChatToolClass,
} from "@axiom/config/chat-tools";
import { runBrowserTool } from "./transport-browser.js";

export const TOOL_LABELS: Record<string, string> = chatToolLabels();
export { classOfTool, CHAT_TOOL_CLASS_LABELS };

export function toolClass(name: string): ChatToolClass | undefined {
  return classOfTool(name);
}

export function toolHint(name: string): string | undefined {
  return getChatToolSpec(name)?.hint;
}

export function formatToolResult(name: string, result: unknown): string {
  return formatToolResultRuntime(name, result);
}

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ToolHandler = (
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
  publicClient: ReturnType<typeof usePublicClient>;
};

export const TOOLS: ToolDefinition[] = CHAT_TOOL_CATALOG.map((t) => ({
  type: "function" as const,
  function: {
    name: t.name,
    description: t.hint,
    parameters: t.parameters ?? { type: "object", properties: {} },
  },
}));

export function useToolHandlers(
  ctx: ToolContext,
): Record<string, ToolHandler> {
  return useMemo(() => {
    const handlers: Record<string, ToolHandler> = {};
    for (const tool of TOOLS) {
      const name = tool.function.name;
      handlers[name] = async (args, c) => runBrowserTool(name, args, c);
    }
    return handlers;
  }, [ctx]);
}