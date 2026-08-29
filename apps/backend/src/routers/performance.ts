import type { Express } from "express";
import { HTTP, EVENT_NAMES } from "@axiom/config/constants";
import { createRoute, positiveIntQuery } from "./route-factory.js";
import { sendError, TTLCache } from "../utils/response.js";
import type { EventStore } from "../events/store.js";
import type { ServerConfig } from "../config-types.js";
import { payloadField, payloadNumber } from "../events/store.js";
import {
  recordAction,
  summarizeCounts,
  type ActionCounts,
} from "../agents/tick-metrics.js";

const perfCache = new TTLCache<unknown>(30_000);

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
    (_parsed, req, _res, { id }) => {
      const limit = positiveIntQuery(req.query.limit, 500);
      const cacheKey = `agent:${id}:${limit}`;
      const cached = perfCache.get(cacheKey);
      if (cached !== undefined) {
        _res.setHeader("x-cache", "HIT");
        return cached;
      }
      const ticks = events.queryByAgent({
        tokenId: id,
        eventName: EVENT_NAMES.Tick,
        limit,
      });

      const counts: ActionCounts = { buyCount: 0, sellCount: 0, holdCount: 0 };
      const history = ticks.map((evt) => ({
        timestamp: evt.receivedAt,
        action: recordAction(evt.payload, counts),
        amount: payloadNumber(evt.payload, "amount") ?? null,
        reason: payloadField(evt.payload, "reason") ?? "",
        durationMs: payloadNumber(evt.payload, "durationMs") ?? null,
        blockNumber: evt.blockNumber,
        txHash: evt.txHash,
      }));

      const result = {
        metrics: summarizeCounts(counts),
        history: history.toReversed(),
      };
      perfCache.set(cacheKey, result);
      return result;
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
    (_parsed, req, res) => {
      const idsRaw = typeof req.query.ids === "string" ? req.query.ids : "";
      const ids = idsRaw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^\d+$/.test(s));
      if (ids.length === 0) return { results: {} };
      if (ids.length > 50) {
        sendError(res, HTTP.BAD_REQUEST, "Maximum 50 agents per batch request");
        return;
      }
      const cacheKey = `batch:${[...ids].sort((a, b) => Number(a) - Number(b)).join(",")}`;
      const cached = perfCache.get(cacheKey);
      if (cached !== undefined) {
        res.setHeader("x-cache", "HIT");
        return cached;
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
          eventName: EVENT_NAMES.Tick,
          limit: 500,
        });
        const counts: ActionCounts = {
          buyCount: 0,
          sellCount: 0,
          holdCount: 0,
        };
        for (const evt of ticks) recordAction(evt.payload, counts);
        results[id] = summarizeCounts(counts);
      }

      const result = { results };
      perfCache.set(cacheKey, result);
      return result;
    },
    config,
  );
}
