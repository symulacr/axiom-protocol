import { useMemo } from "react";
import { usePublicClient } from "wagmi";
import { formatToolResult as formatToolResultRuntime } from "@axiom/chat-runtime";
import {
  chatToolLabels,
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

export const TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "list_my_agents",
      description: "List all agent NFTs owned by the connected wallet address",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "vault_balance",
      description: "Get vault balance (in wei) for a given agent token ID",
      parameters: {
        type: "object",
        properties: {
          tokenId: { type: "string", description: "Agent token ID (numeric)" },
        },
        required: ["tokenId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_metadata",
      description:
        "Get on-chain metadata for an agent (name, owner, data hash, description)",
      parameters: {
        type: "object",
        properties: {
          tokenId: { type: "string", description: "Agent token ID (numeric)" },
        },
        required: ["tokenId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "event_history",
      description: "Query recent on-chain events (Tick, Transfer, etc.)",
      parameters: {
        type: "object",
        properties: {
          eventName: {
            type: "string",
            description: "Filter by event name (Tick, Transfer)",
          },
          limit: { type: "number", description: "Max events (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_tick",
      description:
        "Execute a strategy tick for an agent (simulation via orchestrator)",
      parameters: {
        type: "object",
        properties: {
          tokenId: { type: "string", description: "Agent token ID" },
        },
        required: ["tokenId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "simulate_tick",
      description:
        "Dry-run tick preflight (vault balance + strategy) without live compute",
      parameters: {
        type: "object",
        properties: {
          tokenId: { type: "string", description: "Agent token ID" },
        },
        required: ["tokenId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mint_agent",
      description: "Mint a new agent NFT. Opens MetaMask for the transaction.",
      parameters: {
        type: "object",
        properties: {
          dataDescription: {
            type: "string",
            description: "Human-readable agent name",
          },
          dataHash: {
            type: "string",
            description: "Hex hash of the agent data",
          },
        },
        required: ["dataDescription", "dataHash"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deposit",
      description: "Deposit 0G into an agent vault. Opens MetaMask.",
      parameters: {
        type: "object",
        properties: {
          tokenId: { type: "string", description: "Agent token ID" },
          amount: { type: "string", description: "Amount in 0G (e.g. 1.5)" },
        },
        required: ["tokenId", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "withdraw",
      description: "Withdraw 0G from an agent vault. Opens MetaMask.",
      parameters: {
        type: "object",
        properties: {
          tokenId: { type: "string", description: "Agent token ID" },
          amount: { type: "string", description: "Amount in 0G (e.g. 0.5)" },
        },
        required: ["tokenId", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "archive_lookup",
      description:
        "Look up all Wayback Machine (Internet Archive) snapshots for a URL. Returns list of timestamps where the URL was archived. Use to find snapshotted posts of an account, confirm if a specific URL was ever archived, or get the snapshot URL to view in a browser. NOTE: Twitter/X is JS-rendered; snapshots only contain the HTML shell, not the actual bio or tweet text.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description:
              "Full URL to look up (e.g. https://x.com/handle/status/123)",
          },
          limit: {
            type: "number",
            description: "Max snapshots to return (default 50)",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "archive_account_tweets",
      description:
        "List all archived tweets for an X/Twitter account handle. Returns all tweet URLs that were captured by the Wayback Machine, with timestamps. Use to research an account's snapshotted history.",
      parameters: {
        type: "object",
        properties: {
          handle: {
            type: "string",
            description: 'X/Twitter handle without @ (e.g. "0xSero")',
          },
          limit: {
            type: "number",
            description: "Max snapshots to return (default 100)",
          },
        },
        required: ["handle"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "archive_confirm_deletion",
      description:
        "Check if a specific tweet URL was ever archived by the Wayback Machine. Returns { archived, snapshot, snapshotUrl } — useful as evidence that a post existed at a specific time even if it is now deleted. Does NOT extract tweet content.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description:
              "Full tweet URL (e.g. https://x.com/handle/status/1234567890)",
          },
        },
        required: ["url"],
      },
    },
  },
];

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