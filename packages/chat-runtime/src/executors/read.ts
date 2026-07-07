import { fetchJson } from "../http-json.js";
import type { ToolRuntime } from "../transport.js";
import type { ToolResult } from "../types.js";

function resolveTokenId(
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): string {
  return String(args.tokenId ?? ctx.session.lastTokenId ?? "0");
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
        return err("Wallet not connected");
      }
      const { ok, data } = await fetchJson<{ agents: unknown[] }>(
        ctx.http,
        `/v1/agents?owner=${owner}`,
      );
      if (!ok) return err("agents http fail");
      return okJson({ agents: data.agents ?? [] });
    }
    case "vault_balance": {
      const tokenId = resolveTokenId(args, ctx);
      if (!ctx.chain?.readContract) return err("No chain connection");
      const vault = ctx.session.addresses?.vault;
      if (!vault) return err("Vault address not configured");
      const balance = (await ctx.chain.readContract<bigint>({
        address: vault,
        abi: ["function balanceOf(uint256) view returns (uint256)"],
        functionName: "balanceOf",
        args: [BigInt(tokenId)],
      })) as bigint;
      return okJson({ tokenId, balance: balance.toString() });
    }
    case "agent_metadata": {
      const tokenId = resolveTokenId(args, ctx);
      if (!ctx.chain?.multicall) return err("No chain connection");
      const nft = ctx.session.addresses?.agentNft;
      if (!nft) return err("Agent NFT address not configured");
      const results = await ctx.chain.multicall({
        contracts: [
          { address: nft, abi: ["function name() view returns (string)"], functionName: "name" },
          { address: nft, abi: ["function ownerOf(uint256) view returns (address)"], functionName: "ownerOf", args: [BigInt(tokenId)] },
          {
            address: nft,
            abi: ["function intelligentDatasOf(uint256) view returns ((string dataDescription, bytes32 dataHash)[])"],
            functionName: "intelligentDatasOf",
            args: [BigInt(tokenId)],
          },
        ],
      });
      const datas = (results[2]?.result ?? []) as Array<{
        dataDescription: string;
        dataHash: string;
      }>;
      return okJson({
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
      if (!ok) return err("events http fail");
      return okJson({ events: data.events ?? [] });
    }
    default:
      return err(`Unknown read tool: ${name}`);
  }
}

function okJson(obj: Record<string, unknown>): ToolResult {
  return { ok: true, content: JSON.stringify(obj) };
}

function err(message: string): ToolResult {
  return { ok: false, content: JSON.stringify({ error: message }) };
}