import type { Express } from "express";
import { HTTP, EVENT_NAMES } from "@axiom/config";
import { createRoute } from "./route-factory.js";
import { sendError } from "../utils/response.js";
import type { EventStore } from "../events/store.js";
import type { ServerConfig } from "../server.js";
import { payloadField, payloadNumber } from "../events/payloads.js";
import { TTLCache } from "../utils/cache.js";
import { DEFAULT_EVENT_LIMIT } from "../utils/constants.js";

const perfCache = new TTLCache<unknown>(30_000);
const leaderboardCache = new TTLCache<unknown>(10_000);

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
      const history: Array<{
        timestamp: number;
        action: string;
        amount: number | null;
        reason: string;
        durationMs: number | null;
        blockNumber: number;
        txHash: string | null;
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
      const result = {
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
    async (_parsed, req, res) => {
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

      const result = { results };
      perfCache.set(cacheKey, result);
      return result;
    },
    config,
  );

  createRoute(
    app,
    {
      method: "get",
      path: "/v1/agents/leaderboard",
      consumer: "useLeaderboard",
      description: "Agent leaderboard ranked by action-weighted score (cached 10s)",
    },
    async (_parsed, _req, res) => {
      const cached = leaderboardCache.get("leaderboard");
      if (cached !== undefined) {
        res.setHeader("x-cache", "HIT");
        return cached;
      }
      const ticks = events.getAll(DEFAULT_EVENT_LIMIT, undefined, EVENT_NAMES.Tick);
      const byToken = new Map<string, ActionCounts>();
      for (const evt of ticks) {
        const tokenId = payloadField(evt.payload, "tokenId") ?? "";
        if (!tokenId) continue;
        let counts = byToken.get(tokenId);
        if (!counts) {
          counts = { buyCount: 0, sellCount: 0, holdCount: 0 };
          byToken.set(tokenId, counts);
        }
        recordAction(evt.payload, counts);
      }
      const leaderboard = [...byToken.entries()]
        .map(([tokenId, c]) => ({
          tokenId,
          buys: c.buyCount,
          sells: c.sellCount,
          holds: c.holdCount,
          score: c.buyCount * 2 + c.sellCount * 1.5 - c.holdCount * 0.5,
        }))
        .sort((a, b) => b.score - a.score);
      const result = { leaderboard };
      leaderboardCache.set("leaderboard", result);
      return result;
    },
    config,
  );
}
