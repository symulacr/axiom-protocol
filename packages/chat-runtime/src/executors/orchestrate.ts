import { parseAbi } from "viem";
import { fetchJson, resolveTokenId, toolFail } from "../transport.js";
import type { ToolRuntime } from "../transport.js";
import { STRATEGY_OF_CURRENT, STRATEGY_OF_LEGACY } from "@axiom/config/abis";
import { ZERO_DATA_ROOT } from "@axiom/config/constants";
import type { ToolResult } from "../types.js";

const BALANCE_OF_ABI = parseAbi([
  "function balanceOf(uint256) view returns (uint256)",
]);

const STRATEGY_OF_CURRENT_ABI = parseAbi(STRATEGY_OF_CURRENT); // parseAbi ~10µs/call; hoisted to module scope so per-tick reads reuse, never re-parse
const STRATEGY_OF_LEGACY_ABI = parseAbi(STRATEGY_OF_LEGACY);

async function readStrategyRoot(
  ctx: ToolRuntime,
  vault: `0x${string}`,
  tokenId: string,
): Promise<string | null> {
  const read = ctx.chain?.readContract;
  if (!read) return null;
  const id = BigInt(tokenId);
  try {
    const result = await read<
      readonly [string, bigint, bigint, bigint, bigint]
    >({
      address: vault,
      abi: STRATEGY_OF_CURRENT_ABI,
      functionName: "strategyOf",
      args: [id],
    });
    return result[0];
  } catch {
    try {
      const result = await read<readonly [string, bigint, bigint, bigint]>({
        address: vault,
        abi: STRATEGY_OF_LEGACY_ABI,
        functionName: "strategyOf",
        args: [id],
      });
      return result[0];
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
    return toolFail(`Unknown orchestrate tool: ${name}`);
  }

  const tokenId = resolveTokenId(args, ctx);
  if (!tokenId) return toolFail("tokenId required");

  const dryRun = name === "simulate_tick" || args.dryRun === true;
  const vault = ctx.session.addresses?.vault;
  const agentNft = ctx.session.addresses?.agentNft;

  if (ctx.chain?.readContract && vault && agentNft) {
    const [balance, root] = await Promise.all([
      ctx.chain.readContract<bigint>({
        address: vault,
        abi: BALANCE_OF_ABI,
        functionName: "balanceOf",
        args: [BigInt(tokenId)],
      }),
      readStrategyRoot(ctx, vault, tokenId),
    ]);
    const ready = balance > 0n && root !== ZERO_DATA_ROOT;

    if (!ready && !dryRun) {
      return toolFail("NOT_READY: vault balance or strategy missing");
    }
    if (dryRun) {
      return {
        ok: true as const,
        content: JSON.stringify({
          ok: true,
          simulated: true,
          ready,
          tokenId,
          balance: balance.toString(),
          strategyRoot: ready ? root : (root ?? ZERO_DATA_ROOT),
        }),
      };
    }
  } else if (dryRun) {
    return {
      ok: true as const,
      content: JSON.stringify({ ok: true, simulated: true, tokenId }),
    };
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

  if (!httpOk) return toolFail("tick http fail");
  return { ok: true as const, content: JSON.stringify(data) };
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
  const agentTokenId = resolveTokenId(args, ctx);
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
