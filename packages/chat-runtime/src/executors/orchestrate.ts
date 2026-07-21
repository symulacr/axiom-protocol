import { parseAbi } from "viem";
import { success, fail } from "../result.js";
import { fetchJson } from "../transport.js";
import type { ToolRuntime } from "../transport.js";
import { ZERO_DATA_ROOT } from "@axiom/config";
import type { ToolResult } from "../types.js";

const STRATEGY_OF_CURRENT = [
  "function strategyOf(uint256) view returns (bytes32, uint256, uint256, uint64, uint64)",
] as const;

const STRATEGY_OF_LEGACY = [
  "function strategyOf(uint256) view returns (bytes32, uint256, uint256, uint64)",
] as const;

async function readStrategyRoot(
  ctx: ToolRuntime,
  vault: `0x${string}`,
  tokenId: string,
): Promise<string | null> {
  const read = ctx.chain?.readContract;
  if (!read) return null;
  const id = BigInt(tokenId);
  try {
    const current = await read<readonly [string, bigint, bigint, bigint, bigint]>({
      address: vault,
      abi: parseAbi(STRATEGY_OF_CURRENT),
      functionName: "strategyOf",
      args: [id],
    });
    return current[0] ?? null;
  } catch {
    try {
      const legacy = await read<readonly [string, bigint, bigint, bigint]>({
        address: vault,
        abi: parseAbi(STRATEGY_OF_LEGACY),
        functionName: "strategyOf",
        args: [id],
      });
      return legacy[0] ?? null;
    } catch {
      return null;
    }
  }
}

export async function runOrchestrateTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  if (name !== "execute_tick" && name !== "simulate_tick") {
    return fail(`Unknown orchestrate tool: ${name}`);
  }

  const tokenId = String(args.tokenId ?? ctx.session.lastTokenId ?? "");
  if (!tokenId) return fail("tokenId required");

  const dryRun = name === "simulate_tick" || args.dryRun === true;
  const vault = ctx.session.addresses?.vault;
  const agentNft = ctx.session.addresses?.agentNft;

  if (ctx.chain?.readContract && vault && agentNft) {
    const [balance, root] = await Promise.all([
      ctx.chain.readContract<bigint>({
        address: vault,
        abi: parseAbi(["function balanceOf(uint256) view returns (uint256)"]),
        functionName: "balanceOf",
        args: [BigInt(tokenId)],
      }),
      readStrategyRoot(ctx, vault, tokenId),
    ]);
    const ready =
      balance > 0n && !!root && root !== ZERO_DATA_ROOT;

    if (!ready) {
      if (dryRun) {
        return success({
          ok: true,
          simulated: true,
          ready: false,
          tokenId,
          balance: balance.toString(),
          strategyRoot: root ?? ZERO_DATA_ROOT,
        });
      }
      return fail("NOT_READY: vault balance or strategy missing");
    }

    if (dryRun) {
      return success({
        ok: true,
        simulated: true,
        ready: true,
        tokenId,
        balance: balance.toString(),
        strategyRoot: root,
      });
    }
  } else if (dryRun) {
    return success({ ok: true, simulated: true, tokenId });
  }

  const { ok: httpOk, data } = await fetchJson<Record<string, unknown>>(
    ctx.http,
    "/v1/orchestrator/tick",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildTickBody(args, ctx)),
    },
  );

  if (!httpOk) return fail("tick http fail");
  return success(data);
}


export function buildTickBody(
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): {
  vault: `0x${string}` | undefined;
  agentNft: `0x${string}` | undefined;
  agentTokenId: string;
  computeModel?: string;
} {
  const vault = ctx.session.addresses?.vault;
  const agentNft = ctx.session.addresses?.agentNft;
  const agentTokenId = String(args.tokenId ?? ctx.session.lastTokenId ?? "");
  const body: {
    vault: `0x${string}` | undefined;
    agentNft: `0x${string}` | undefined;
    agentTokenId: string;
    computeModel?: string;
  } = { vault, agentNft, agentTokenId };

  const computeModel =
    typeof args.computeModel === "string" && args.computeModel.trim()
      ? args.computeModel.trim()
      : undefined;
  if (computeModel) body.computeModel = computeModel;

  return body;
}
