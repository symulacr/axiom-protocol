import { parseAbi } from "viem";
import { fetchJson, resolveTokenId, toolFail } from "../transport.js";
import type { ToolRuntime } from "../transport.js";
import type { ToolResult } from "../types.js";

/** Shared read-list leg: GET path → `{ [key]: rows }` envelope (empty array when the backend omits the key). */
async function fetchList(
  ctx: ToolRuntime,
  path: string,
  key: "agents" | "events",
  failLabel: string,
): Promise<ToolResult> {
  const { ok, data } = await fetchJson<Record<string, unknown[]>>(
    ctx.http,
    path,
  );
  if (!ok) return toolFail(failLabel);
  return {
    ok: true as const,
    content: JSON.stringify({ [key]: data[key] ?? [] }),
  };
}

export async function runReadTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  switch (name) {
    case "list_my_agents": {
      const owner = ctx.session.walletAddress;
      if (!owner) {
        return toolFail("Wallet not connected");
      }
      return fetchList(
        ctx,
        `/v1/agents?owner=${owner}`,
        "agents",
        "agents http fail",
      );
    }
    case "vault_balance": {
      const tokenId = resolveTokenId(args, ctx);
      if (!tokenId) return toolFail("tokenId required");
      if (!ctx.chain?.readContract) return toolFail("No chain connection");
      const vault = ctx.session.addresses?.vault;
      if (!vault) return toolFail("Vault address not configured");
      const balance = (await ctx.chain.readContract<bigint>({
        address: vault,
        abi: parseAbi(["function balanceOf(uint256) view returns (uint256)"]),
        functionName: "balanceOf",
        args: [BigInt(tokenId)],
      })) as bigint;
      return {
        ok: true as const,
        content: JSON.stringify({ tokenId, balance: balance.toString() }),
      };
    }
    case "agent_metadata": {
      const tokenId = resolveTokenId(args, ctx);
      if (!tokenId) return toolFail("tokenId required");
      if (!ctx.chain?.multicall) return toolFail("No chain connection");
      const nft = ctx.session.addresses?.agentNft;
      if (!nft) return toolFail("Agent NFT address not configured");
      const results = await ctx.chain.multicall({
        contracts: [
          {
            address: nft,
            abi: parseAbi(["function name() view returns (string)"]),
            functionName: "name",
          },
          {
            address: nft,
            abi: parseAbi(["function ownerOf(uint256) view returns (address)"]),
            functionName: "ownerOf",
            args: [BigInt(tokenId)],
          },
          {
            address: nft,
            abi: parseAbi([
              "function intelligentDatasOf(uint256) view returns ((string dataDescription, bytes32 dataHash)[])",
            ]),
            functionName: "intelligentDatasOf",
            args: [BigInt(tokenId)],
          },
        ],
      });
      const datas = (results[2]?.result ?? []) as Array<{
        dataDescription: string;
        dataHash: string;
      }>;
      return {
        ok: true as const,
        content: JSON.stringify({
          tokenId,
          name: String(results[0]?.result ?? ""),
          owner: String(results[1]?.result ?? ""),
          dataDescription: datas[0]?.dataDescription ?? "",
          dataHash: datas[0]?.dataHash ?? "",
        }),
      };
    }
    case "event_history": {
      const limit = Number(args.limit ?? 20);
      let path = `/v1/events?limit=${limit}`;
      if (args.eventName) {
        path += `&eventName=${encodeURIComponent(String(args.eventName))}`;
      }
      return fetchList(ctx, path, "events", "events http fail");
    }
    default:
      return toolFail(`Unknown read tool: ${name}`);
  }
}
