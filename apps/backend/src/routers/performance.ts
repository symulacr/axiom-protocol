import type { Express } from "express";
import { createRoute } from "./route-factory.js";
import { sendError } from "../utils/response.js";
import type { EventStore } from "../events/store.js";
import type { ServerConfig } from "../server.js";
import { payloadField, payloadNumber } from "../events/payloads.js";

type ActionCounts = { buyCount: number; sellCount: number; holdCount: number };

function recordAction(payload: unknown, counts: ActionCounts): string {
  const action = (payloadField(payload, "action") ?? "").toLowerCase();
  if (action === "buy") counts.buyCount++;
  else if (action === "sell") counts.sellCount++;
  else counts.holdCount++;
  return action;
}

export function registerPerformanceRoutes(
  app: Express,
  config: ServerConfig,
  events: EventStore,
): void {
  createRoute(
    app,
    {
      method: "get",
      path: "/v1/agents/:id/performance",
      requireId: true,
      consumer: "usePerformance",
      description: "Agent strategy performance metrics",
    },
    async (_parsed, req, _res, { id }) => {
      const limitRaw =
        typeof req.query.limit === "string"
          ? Number(req.query.limit)
          : undefined;
      const limit =
        limitRaw !== undefined && Number.isInteger(limitRaw) && limitRaw > 0
          ? limitRaw
          : 500;
      const ticks = events.queryByAgent({
        tokenId: id,
        eventName: "Tick",
        limit,
      });

      const counts: ActionCounts = { buyCount: 0, sellCount: 0, holdCount: 0 };
      const history: Array<{
        timestamp: number;
        action: string;
        amount: number | null;
        reason: string;
        durationMs: number | null;
        blockNumber: number;
        txHash: string;
      }> = [];

      for (const evt of ticks) {
        const action = recordAction(evt.payload, counts);

        history.push({
          timestamp: evt.receivedAt,
          action,
          amount: payloadNumber(evt.payload, "amount") ?? null,
          reason: payloadField(evt.payload, "reason") ?? "",
          durationMs: payloadNumber(evt.payload, "durationMs") ?? null,
          blockNumber: evt.blockNumber,
          txHash: evt.txHash,
        });
      }

      const totalTicks = counts.buyCount + counts.sellCount + counts.holdCount;
      const buyRate = totalTicks > 0 ? counts.buyCount / totalTicks : 0;
      return {
        metrics: {
          totalTicks,
          buyCount: counts.buyCount,
          sellCount: counts.sellCount,
          holdCount: counts.holdCount,
          buyRate,
          winRate: buyRate,
        },
        history: history.reverse(),
      };
    },
    config,
  );

  createRoute(
    app,
    {
      method: "get",
      path: "/v1/agents/performance/batch",
      consumer: "usePerformanceBatch",
      description: "Batch agent performance metrics",
    },
    async (_parsed, req, res) => {
      const idsRaw = typeof req.query.ids === "string" ? req.query.ids : "";
      const ids = idsRaw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^\d+$/.test(s));
      if (ids.length === 0) return { results: {} };
      if (ids.length > 50) {
        sendError(res, 400, "Maximum 50 agents per batch request");
        return;
      }

      const results: Record<
        string,
        {
          totalTicks: number;
          buyCount: number;
          sellCount: number;
          holdCount: number;
          buyRate: number;
          winRate: number;
        }
      > = {};

      for (const id of ids) {
        const ticks = events.queryByAgent({
          tokenId: id,
          eventName: "Tick",
          limit: 500,
        });
        const counts: ActionCounts = { buyCount: 0, sellCount: 0, holdCount: 0 };
        for (const evt of ticks) {
          recordAction(evt.payload, counts);
        }
        const totalTicks = counts.buyCount + counts.sellCount + counts.holdCount;
        const buyRate = totalTicks > 0 ? counts.buyCount / totalTicks : 0;
        results[id] = {
          totalTicks,
          buyCount: counts.buyCount,
          sellCount: counts.sellCount,
          holdCount: counts.holdCount,
          buyRate,
          winRate: buyRate,
        };
      }

      return { results };
    },
    config,
  );
}
