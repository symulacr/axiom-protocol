import { parseAbi, parseEther } from "viem";
import { postJson, resolveTokenId, toolFail } from "../transport.js";
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
    const verdict = ready ? "ready" : "not_ready";
    const verdictReason = ready
      ? "vault funded and strategy root set"
      : balance === 0n
        ? "vault balance is zero"
        : "strategy root is zero — execute_tick will refuse until the owner signs setStrategy with a non-zero root";

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
          verdict,
          verdictReason,
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

  const { ok: httpOk, data } = await postJson<Record<string, unknown>>(
    ctx.http,
    "/v1/orchestrator/tick",
    buildTickBody(args, ctx),
  );

  if (!httpOk) return toolFail("tick http fail");
  return { ok: true as const, content: JSON.stringify(data) };
}

export interface TickPlanArg {
  /** Recipient/contract address — used as-is. */
  target: string;
  /** Human OG amount, parsed to a wei string with parseEther. */
  value: string;
  /** Calldata hex, used as-is (defaults to "0x" server-side). */
  data?: string;
}

/**
 * Leaf-as-root convention: the wire plan always carries merkleProof: [] — a
 * single-action strategy root IS the leaf, and OZ processProof([]) returns the
 * leaf unchanged. The plan only settles if it matches the strategy root the
 * owner signed; the server keeps the client-key 403 on raw executionPlan bodies.
 */
function buildWirePlan(plan: TickPlanArg): {
  target: `0x${string}`;
  value: string;
  data?: `0x${string}`;
  merkleProof: `0x${string}`[];
} {
  return {
    target: plan.target as `0x${string}`,
    value: parseEther(plan.value).toString(),
    ...(plan.data !== undefined ? { data: plan.data as `0x${string}` } : {}),
    merkleProof: [],
  };
}

export function buildTickBody(
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): {
  vault: `0x${string}` | undefined;
  agentNft: `0x${string}` | undefined;
  agentTokenId: string;
  computeModel?: string;
  executionPlan?: {
    target: `0x${string}`;
    value: string;
    data?: `0x${string}`;
    merkleProof: `0x${string}`[];
  };
} {
  const vault = ctx.session.addresses?.vault;
  const agentNft = ctx.session.addresses?.agentNft;
  const agentTokenId = resolveTokenId(args, ctx);
  const body: {
    vault: `0x${string}` | undefined;
    agentNft: `0x${string}` | undefined;
    agentTokenId: string;
    computeModel?: string;
    executionPlan?: {
      target: `0x${string}`;
      value: string;
      data?: `0x${string}`;
      merkleProof: `0x${string}`[];
    };
  } = { vault, agentNft, agentTokenId };

  const computeModel =
    typeof args.computeModel === "string" && args.computeModel.trim()
      ? args.computeModel.trim()
      : undefined;
  if (computeModel) body.computeModel = computeModel;

  const plan = args.plan as TickPlanArg | undefined;
  if (
    plan &&
    typeof plan.target === "string" &&
    plan.target &&
    typeof plan.value === "string" &&
    plan.value
  ) {
    body.executionPlan = buildWirePlan(plan);
  }

  return body;
}
