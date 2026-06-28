import type { Express } from "express";
import type { z } from "zod";
import { createRoute } from "./route-factory.js";
import { DEFAULT_EVENT_LIMIT } from "../utils/constants.js";
import { eventBodySchema } from "../route-schemas.js";
import type { EventStore } from "../events/store.js";
import type { ServerConfig } from "../server.js";

export function registerEventRoutes(
  app: Express,
  config: ServerConfig,
  events: EventStore,
): void {
  createRoute(app, {
    method: "post", path: "/v1/events", schema: eventBodySchema,
    consumer: "sink.ts", description: "Append event to store (indexer)",
  }, async (parsed, _req, _res) => {
    const b = parsed as z.infer<typeof eventBodySchema>;
    const stored = events.append({
      source: b.source, eventName: b.eventName, chainId: b.chainId,
      blockNumber: b.blockNumber, txHash: b.txHash, logIndex: b.logIndex,
      payload: b.payload, receivedAt: Date.now(), timestamp: Date.now(),
    });
    return { stored };
  }, config);

  createRoute(app, {
    method: "get", path: "/v1/events",
    consumer: "useEventHistory", description: "Query events with optional filters",
  }, async (_parsed, req, _res) => {
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const limit = limitRaw !== undefined && Number.isInteger(limitRaw) && limitRaw > 0 ? limitRaw : DEFAULT_EVENT_LIMIT;
    const sinceRaw = typeof req.query.since === "string" ? Number(req.query.since) : undefined;
    const since = sinceRaw !== undefined && !isNaN(sinceRaw) && sinceRaw > 0 ? sinceRaw : undefined;
    const eventName = req.query.eventName as string | undefined;
    const all = events.getAll(limit, since, eventName);
    const owner = req.query.owner as string | undefined;
    const ownerFiltered = owner
      ? all.filter((e) => {
          const payload = e.payload as Record<string, unknown>;
          return payload?.owner === owner || payload?.to === owner || payload?.from === owner;
        })
      : all;
    return { events: ownerFiltered };
  }, config);
}
