// Shared tick-action metrics for the performance REST surface (routers/performance.ts)
// and the MCP performance tools (mcp/tools.ts) — one canonical definition so both
// surfaces always agree; winRate = non-hold ticks (buy OR sell), NOT buyRate.
import { payloadField } from "../events/store.js";

export type ActionCounts = {
  buyCount: number;
  sellCount: number;
  holdCount: number;
};

export function recordAction(payload: unknown, counts: ActionCounts): string {
  const action = (payloadField(payload, "action") ?? "").toLowerCase();
  if (action === "buy") counts.buyCount++;
  else if (action === "sell") counts.sellCount++;
  else counts.holdCount++;
  return action;
}

export function summarizeCounts(counts: ActionCounts) {
  const totalTicks = counts.buyCount + counts.sellCount + counts.holdCount;
  return {
    totalTicks,
    buyCount: counts.buyCount,
    sellCount: counts.sellCount,
    holdCount: counts.holdCount,
    buyRate: totalTicks > 0 ? counts.buyCount / totalTicks : 0,
    winRate:
      totalTicks > 0 ? (counts.buyCount + counts.sellCount) / totalTicks : 0,
  };
}
