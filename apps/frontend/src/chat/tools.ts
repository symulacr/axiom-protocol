import { useMemo } from "react";
import { usePublicClient } from "wagmi";
import { parseEther, formatEther } from "viem";
import { apiFetch } from "../utils/apiFetch.js";
import { humanizeError } from "../utils/format.js";
import {
  getAxiomAgentNftAddress,
  getAxiomStrategyVaultAddress,
} from "../abi/addresses.js";
import { axiomAgentNftAbi } from "../abi/axiomAgentNft.js";
import { axiomStrategyVaultAbi } from "../abi/axiomStrategyVault.js";

export const TOOL_LABELS: Record<string, string> = {
  vault_balance: "Vault Balance",
  agent_metadata: "Agent Info",
  list_my_agents: "Your Agents",
  execute_tick: "Execute Tick",
  mint_agent: "Mint Agent",
  deposit: "Deposit",
  withdraw: "Withdraw",
};

export function formatToolResult(name: string, result: unknown): string {
  let r: unknown = result;
  if (typeof r === "string") {
    try {
      r = JSON.parse(r);
    } catch {
      return r as string;
    }
  }
  if (typeof r !== "object" || r === null) return String(r);
  const obj = r as Record<string, unknown>;
  if (obj.error !== undefined) return `Error: ${String(obj.error)}`;
  if (obj.ok === true && obj.txHash !== undefined)
    return `Transaction sent: ${String(obj.txHash)}`;
  if (obj.balance !== undefined) {
    const bal =
      typeof obj.balance === "string"
        ? BigInt(obj.balance)
        : BigInt(String(obj.balance));
    return `Balance: ${formatEther(bal)} 0G`;
  }
  if (obj.tokenId !== undefined && Object.keys(obj).length <= 2)
    return `Agent #${obj.tokenId}`;
  if (obj.agents !== undefined) {
    const agents = obj.agents as unknown[];
    if (agents.length === 0) return "No agents found.";
    return agents
      .map((a, i) => {
        const agent = a as Record<string, unknown>;
        return `${i + 1}. Agent #${agent.tokenId ?? "?"} — ${agent.dataDescription ?? agent.name ?? "Unnamed"}`;
      })
      .join("\n");
  }
  if (obj.events !== undefined) {
    const events = obj.events as unknown[];
    if (events.length === 0) return "No events found.";
    return events
      .map((e) => {
        const ev = e as Record<string, unknown>;
        return `• ${ev.event ?? ev.name ?? "Event"} (block ${ev.blockNumber ?? "?"})`;
      })
      .join("\n");
  }
  // Fallback: pretty-print known fields
  const lines = Object.entries(obj).map(([k, v]) => `${k}: ${String(v)}`);
  return lines.join("\n");
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
  writeContractAsync: (args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args: unknown[];
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
          amount: { type: "string", description: "Amount in wei" },
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
  return useMemo(
    () => ({
      list_my_agents: async (_args, c) => {
        if (!c.address)
          return JSON.stringify({ error: "Wallet not connected" });
        const data = await apiFetch<{ agents: unknown[] }>(
          `/v1/agents?owner=${c.address}`,
          { timeout: 10_000 },
        );
        return JSON.stringify({ agents: data.agents ?? [] });
      },
      vault_balance: async (args, c) => {
        const { tokenId } = args;
        if (!c.publicClient)
          return JSON.stringify({ error: "No chain connection" });
        const balance = (await c.publicClient.readContract({
          address: getAxiomStrategyVaultAddress(c.chainId),
          abi: axiomStrategyVaultAbi,
          functionName: "balanceOf",
          args: [BigInt(String(tokenId))],
        })) as bigint;
        return JSON.stringify({ tokenId, balance: balance.toString() });
      },
      agent_metadata: async (args, c) => {
        const { tokenId } = args;
        if (!c.publicClient)
          return JSON.stringify({ error: "No chain connection" });
        const nftAddr = getAxiomAgentNftAddress(c.chainId);
        const [nameRes, symbolRes, ownerRes, datasRes, uriRes] =
          (await c.publicClient.multicall({
            contracts: [
              { address: nftAddr, abi: axiomAgentNftAbi, functionName: "name" },
              {
                address: nftAddr,
                abi: axiomAgentNftAbi,
                functionName: "symbol",
              },
              {
                address: nftAddr,
                abi: axiomAgentNftAbi,
                functionName: "ownerOf",
                args: [BigInt(String(tokenId))],
              },
              {
                address: nftAddr,
                abi: axiomAgentNftAbi,
                functionName: "intelligentDatasOf",
                args: [BigInt(String(tokenId))],
              },
              {
                address: nftAddr,
                abi: axiomAgentNftAbi,
                functionName: "tokenURI",
                args: [BigInt(String(tokenId))],
              },
            ],
          })) as Array<{ result: unknown; error?: Error }>;
        return JSON.stringify({
          tokenId,
          name: String(nameRes?.result ?? ""),
          symbol: String(symbolRes?.result ?? ""),
          owner: String(ownerRes?.result ?? ""),
          dataDescription:
            (
              (datasRes?.result ?? []) as Array<{ dataDescription: string }>
            )?.[0]?.dataDescription ?? "",
          dataHash:
            ((datasRes?.result ?? []) as Array<{ dataHash: string }>)?.[0]
              ?.dataHash ?? "",
          tokenUri: String(uriRes?.result ?? ""),
        });
      },
      event_history: async (args) => {
        const { eventName, limit } = args;
        let path = `/v1/events?limit=${limit ?? 20}`;
        if (eventName)
          path += `&eventName=${encodeURIComponent(String(eventName))}`;
        const data = await apiFetch<{ events: unknown[] }>(path, {
          timeout: 10_000,
        });
        return JSON.stringify({ events: data.events ?? [] });
      },
      execute_tick: async (args) => {
        const tokenId = String(args.tokenId ?? "");
        if (!tokenId) return JSON.stringify({ error: "tokenId required" });
        const data = await apiFetch<Record<string, unknown>>(
          "/v1/orchestrator/tick",
          {
            method: "POST",
            body: JSON.stringify({
              vault: getAxiomStrategyVaultAddress(ctx.chainId),
              agentNft: getAxiomAgentNftAddress(ctx.chainId),
              agentTokenId: tokenId,
            }),
            timeout: 30_000,
          },
        );
        return JSON.stringify(data);
      },
      mint_agent: async (args, c) => {
        if (!c.address)
          return JSON.stringify({ error: "Wallet not connected" });
        if (!c.writeContractAsync)
          return JSON.stringify({ error: "Wallet not available" });
        if (!c.publicClient)
          return JSON.stringify({ error: "No chain connection" });
        try {
          const mintFee = (await c.publicClient.readContract({
            address: getAxiomAgentNftAddress(c.chainId),
            abi: axiomAgentNftAbi,
            functionName: "mintFee",
          })) as bigint;

          const txHash = await c.writeContractAsync({
            address: getAxiomAgentNftAddress(c.chainId),
            abi: axiomAgentNftAbi,
            functionName: "mint",
            args: [
              [
                {
                  dataDescription: String(args.dataDescription ?? ""),
                  dataHash: String(args.dataHash ?? "0x"),
                },
              ],
              c.address,
            ],
            value: mintFee,
          });
          return JSON.stringify({ ok: true, txHash });
        } catch (err: unknown) {
          return JSON.stringify({ error: humanizeError(err) });
        }
      },
      deposit: async (args, c) => {
        if (!c.address)
          return JSON.stringify({ error: "Wallet not connected" });
        if (!c.writeContractAsync)
          return JSON.stringify({ error: "Wallet not available" });
        try {
          const txHash = await c.writeContractAsync({
            address: getAxiomStrategyVaultAddress(c.chainId),
            abi: axiomStrategyVaultAbi,
            functionName: "deposit",
            args: [BigInt(String(args.tokenId ?? "0"))],
            value: parseEther(String(args.amount ?? "0")),
          });
          return JSON.stringify({ ok: true, txHash });
        } catch (err: unknown) {
          return JSON.stringify({ error: humanizeError(err) });
        }
      },
      withdraw: async (args, c) => {
        if (!c.address)
          return JSON.stringify({ error: "Wallet not connected" });
        if (!c.writeContractAsync)
          return JSON.stringify({ error: "Wallet not available" });
        try {
          const txHash = await c.writeContractAsync({
            address: getAxiomStrategyVaultAddress(c.chainId),
            abi: axiomStrategyVaultAbi,
            functionName: "withdraw",
            args: [
              BigInt(String(args.tokenId ?? "0")),
              BigInt(String(args.amount ?? "0")),
            ],
          });
          return JSON.stringify({ ok: true, txHash });
        } catch (err: unknown) {
          return JSON.stringify({ error: humanizeError(err) });
        }
      },
      archive_lookup: async (args) => {
        const { apiFetch: fetchApi } = await import("../utils/apiFetch.js");
        const { url, limit } = args as { url: string; limit?: number };
        const params = new URLSearchParams({ url });
        if (limit !== undefined) params.set("limit", String(limit));
        const data = await fetchApi<{
          url: string;
          count: number;
          snapshots: Array<{
            url: string;
            timestamp: string;
            iso: string;
            snapshotUrl: string;
          }>;
        }>(`/v1/archive/snapshots?${params.toString()}`, { timeout: 30_000 });
        return JSON.stringify({
          url: data.url,
          count: data.count,
          snapshots: data.snapshots.map((s) => ({
            archivedAt: s.iso,
            snapshotUrl: s.snapshotUrl,
          })),
          note: "Snapshots contain only the HTML shell (Twitter/X is JS-rendered). Open snapshotUrl in a browser to view rendered content.",
        });
      },
      archive_account_tweets: async (args) => {
        const { apiFetch: fetchApi } = await import("../utils/apiFetch.js");
        const { handle, limit } = args as { handle: string; limit?: number };
        const data = await fetchApi<{
          handle: string;
          count: number;
          snapshots: Array<{
            url: string;
            timestamp: string;
            iso: string;
            snapshotUrl: string;
          }>;
        }>("/v1/archive/account", {
          method: "POST",
          body: JSON.stringify({ handle, limit: limit ?? 100 }),
          timeout: 30_000,
        });
        return JSON.stringify({
          handle: data.handle,
          archivedTweetCount: data.count,
          tweets: data.snapshots.map((s) => ({
            tweetUrl: s.url,
            archivedAt: s.iso,
            snapshotUrl: s.snapshotUrl,
          })),
          note: "Each entry is a tweet URL archived at the given timestamp. The actual tweet text is not extractable from snapshots (JS-rendered).",
        });
      },
      archive_confirm_deletion: async (args) => {
        const { apiFetch: fetchApi } = await import("../utils/apiFetch.js");
        const { url } = args as { url: string };
        const data = await fetchApi<{
          archived: boolean;
          snapshot: {
            url: string;
            timestamp: string;
            iso: string;
            snapshotUrl: string;
          } | null;
        }>("/v1/archive/confirm", {
          method: "POST",
          body: JSON.stringify({ url }),
          timeout: 30_000,
        });
        return JSON.stringify({
          url,
          wasArchived: data.archived,
          snapshotUrl: data.snapshot?.snapshotUrl ?? null,
          archivedAt: data.snapshot?.iso ?? null,
          interpretation: data.archived
            ? `Wayback Machine captured this URL on ${data.snapshot?.iso}. Evidence the content existed at that time. Open snapshotUrl in a browser to view the rendered page.`
            : "Wayback Machine has no snapshot of this URL. Cannot confirm or deny if it ever existed.",
        });
      },
    }),
    [ctx.address, ctx.chainId, ctx.writeContractAsync, ctx.publicClient],
  );
}