import type { Express } from "express";
import { createRoute } from "./route-factory.js";
import type { EventStore } from "../events/store.js";
import type { ServerConfig } from "../server.js";
import { payloadField, payloadNumber } from "../events/payloads.js";

export function registerPerformanceRoutes(
  app: Express,
  config: ServerConfig,
  events: EventStore,
): void {
  createRoute(app, {
    method: "get", path: "/v1/agents/:id/performance", requireId: true,
    consumer: "usePerformance", description: "Agent strategy performance metrics",
  }, async (_parsed, req, _res, { id }) => {
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const limit = limitRaw !== undefined && Number.isInteger(limitRaw) && limitRaw > 0 ? limitRaw : 500;
    const ticks = events.queryByAgent({ tokenId: id, eventName: "Tick", limit });

    let buyCount = 0, sellCount = 0, holdCount = 0;
    const history: Array<{ timestamp: number; action: string; amount: number | null; reason: string; durationMs: number | null; blockNumber: number; txHash: string }> = [];

    for (const evt of ticks) {
      const action = (payloadField(evt.payload, "action") ?? "").toLowerCase();
      if (action === "buy") buyCount++;
      else if (action === "sell") sellCount++;
      else holdCount++;

      history.push({
        timestamp: evt.receivedAt, action,
        amount: payloadNumber(evt.payload, "amount") ?? null,
        reason: payloadField(evt.payload, "reason") ?? "",
        durationMs: payloadNumber(evt.payload, "durationMs") ?? null,
        blockNumber: evt.blockNumber, txHash: evt.txHash,
      });
    }

    const totalTicks = buyCount + sellCount + holdCount;
    return {
      metrics: { totalTicks, buyCount, sellCount, holdCount, winRate: totalTicks > 0 ? buyCount / totalTicks : 0 },
      history: history.reverse(),
    };
  }, config);

  createRoute(app, {
    method: "get", path: "/v1/agents/performance/batch",
    consumer: "usePerformanceBatch", description: "Batch agent performance metrics",
  }, async (_parsed, req, _res) => {
    const idsRaw = typeof req.query.ids === "string" ? req.query.ids : "";
    const ids = idsRaw.split(",").map(s => s.trim()).filter(s => /^\d+$/.test(s));
    if (ids.length === 0) return { results: {} };
    if (ids.length > 50) return { error: "Maximum 50 agents per batch request" };

    const results: Record<string, { totalTicks: number; buyCount: number; sellCount: number; holdCount: number; winRate: number }> = {};

    for (const id of ids) {
      const ticks = events.queryByAgent({ tokenId: id, eventName: "Tick", limit: 500 });
      let buyCount = 0, sellCount = 0, holdCount = 0;
      for (const evt of ticks) {
        const action = (payloadField(evt.payload, "action") ?? "").toLowerCase();
        if (action === "buy") buyCount++;
        else if (action === "sell") sellCount++;
        else holdCount++;
      }
      const totalTicks = buyCount + sellCount + holdCount;
      results[id] = { totalTicks, buyCount, sellCount, holdCount, winRate: totalTicks > 0 ? buyCount / totalTicks : 0 };
    }

    return { results };
  }, config);
}
