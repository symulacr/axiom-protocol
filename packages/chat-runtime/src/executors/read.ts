import { humanAbi } from "../abi.js";
import { fetchJson } from "../http-json.js";
import type { ToolRuntime } from "../transport.js";
import type { ToolResult } from "../types.js";
import { success, fail } from "../tool-result.js";

function resolveTokenId(
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): string {
  const id = args.tokenId ?? ctx.session.lastTokenId;
  return id === undefined || id === null ? "" : String(id);
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
        return fail("Wallet not connected");
      }
      const { ok, data } = await fetchJson<{ agents: unknown[] }>(
        ctx.http,
        `/v1/agents?owner=${owner}`,
      );
      if (!ok) return fail("agents http fail");
      return success({ agents: data.agents ?? [] });
    }
    case "vault_balance": {
      const tokenId = resolveTokenId(args, ctx);
      if (!tokenId) return fail("tokenId required");
      if (!ctx.chain?.readContract) return fail("No chain connection");
      const vault = ctx.session.addresses?.vault;
      if (!vault) return fail("Vault address not configured");
      const balance = (await ctx.chain.readContract<bigint>({
        address: vault,
        abi: humanAbi(["function balanceOf(uint256) view returns (uint256)"]),
        functionName: "balanceOf",
        args: [BigInt(tokenId)],
      })) as bigint;
      return success({ tokenId, balance: balance.toString() });
    }
    case "agent_metadata": {
      const tokenId = resolveTokenId(args, ctx);
      if (!tokenId) return fail("tokenId required");
      if (!ctx.chain?.multicall) return fail("No chain connection");
      const nft = ctx.session.addresses?.agentNft;
      if (!nft) return fail("Agent NFT address not configured");
      const results = await ctx.chain.multicall({
        contracts: [
          {
            address: nft,
            abi: humanAbi(["function name() view returns (string)"]),
            functionName: "name",
          },
          {
            address: nft,
            abi: humanAbi(["function ownerOf(uint256) view returns (address)"]),
            functionName: "ownerOf",
            args: [BigInt(tokenId)],
          },
          {
            address: nft,
            abi: humanAbi([
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
      return success({
        tokenId,
        name: String(results[0]?.result ?? ""),
        owner: String(results[1]?.result ?? ""),
        dataDescription: datas[0]?.dataDescription ?? "",
        dataHash: datas[0]?.dataHash ?? "",
      });
    }
    case "event_history": {
      const limit = Number(args.limit ?? 20);
      let path = `/v1/events?limit=${limit}`;
      if (args.eventName) {
        path += `&eventName=${encodeURIComponent(String(args.eventName))}`;
      }
      const { ok, data } = await fetchJson<{ events: unknown[] }>(ctx.http, path);
      if (!ok) return fail("events http fail");
      return success({ events: data.events ?? [] });
    }
    default:
      return fail(`Unknown read tool: ${name}`);
  }
}

