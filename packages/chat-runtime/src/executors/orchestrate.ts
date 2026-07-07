import { humanAbi } from "../abi.js";
import { fetchJson } from "../http-json.js";
import type { ToolRuntime } from "../transport.js";
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
      abi: humanAbi(STRATEGY_OF_CURRENT),
      functionName: "strategyOf",
      args: [id],
    });
    return current[0] ?? null;
  } catch {
    try {
      const legacy = await read<readonly [string, bigint, bigint, bigint]>({
        address: vault,
        abi: humanAbi(STRATEGY_OF_LEGACY),
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
        abi: humanAbi(["function balanceOf(uint256) view returns (uint256)"]),
        functionName: "balanceOf",
        args: [BigInt(tokenId)],
      }),
      readStrategyRoot(ctx, vault, tokenId),
    ]);
    const zeroRoot = "0x" + "0".repeat(64);
    const ready =
      balance > 0n && !!root && root !== zeroRoot;

    if (!ready) {
      if (dryRun) {
        return success({
          ok: true,
          simulated: true,
          ready: false,
          tokenId,
          balance: balance.toString(),
          strategyRoot: root ?? zeroRoot,
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vault,
        agentNft,
        agentTokenId: tokenId,
      }),
    },
  );

  if (!httpOk) return fail("tick http fail");
  return success(data);
}

function success(obj: Record<string, unknown>): ToolResult {
  return { ok: true, content: JSON.stringify(obj) };
}

function fail(message: string): ToolResult {
  return { ok: false, content: JSON.stringify({ error: message }) };
}