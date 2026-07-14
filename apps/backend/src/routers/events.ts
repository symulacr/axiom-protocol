import type { Express } from "express";
import type { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { createRoute } from "./route-factory.js";
import {
  DEFAULT_EVENT_LIMIT,
  MAX_EVENT_QUERY_LIMIT,
} from "../utils/constants.js";
import { eventBodySchema } from "../route-schemas.js";
import { HTTP } from "@axiom/config";
import { sendError } from "../utils/response.js";
import type { EventStore } from "../events/store.js";
import type { ServerConfig } from "../server.js";

export const DEFAULT_EVENT_SOURCES = ["indexer"] as const;

export function resolveEventSources(extra?: string): Set<string> {
  const allowed = new Set<string>(DEFAULT_EVENT_SOURCES);
  const raw = extra ?? process.env.AXIOM_EVENT_SOURCES ?? "";
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (trimmed) allowed.add(trimmed);
  }
  return allowed;
}

export function isAuthorizedKey(
  provided: string | undefined,
  expected: string | undefined,
): boolean {
  if (!expected) return false;
  const p = Buffer.from(typeof provided === "string" ? provided : "", "utf-8");
  const e = Buffer.from(expected, "utf-8");
  return p.length === e.length && timingSafeEqual(p, e);
}

export type EventPostAuth =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string };

export const INDEXER_KEY_HEADER = "x-indexer-key" as const;

export function authorizeEventPost(opts: {
  source: string;
  indexerKey: string | undefined;
  indexerApiKey: string | undefined;
  allowedSources?: Set<string>;
}): EventPostAuth {
  const allowed = opts.allowedSources ?? resolveEventSources();
  if (!opts.source || !allowed.has(opts.source)) {
    return {
      ok: false,
      status: HTTP.BAD_REQUEST,
      code: "UNTRUSTED_EVENT_SOURCE",
      message: `rejected event from untrusted source: "${opts.source}"`,
    };
  }
  if (!isAuthorizedKey(opts.indexerKey, opts.indexerApiKey)) {
    return {
      ok: false,
      status: HTTP.UNAUTHORIZED,
      code: "INDEXER_UNAUTHORIZED",
      message:
        "unauthorized: POST /v1/events requires the dedicated indexer API key",
    };
  }
  return { ok: true };
}

export function registerEventRoutes(
  app: Express,
  config: ServerConfig,
  events: EventStore,
): void {
  createRoute(
    app,
    {
      method: "post",
      path: "/v1/events",
      schema: eventBodySchema,
      consumer: "indexer",
      description: "Append event to store (indexer)",
    },
    async (parsed, req, res) => {
      const b = parsed as z.infer<typeof eventBodySchema>;
      const indexerKey =
        typeof req.headers[INDEXER_KEY_HEADER] === "string"
          ? (req.headers[INDEXER_KEY_HEADER] as string)
          : undefined;
      const auth = authorizeEventPost({
        source: b.source,
        indexerKey,
        indexerApiKey: config.env?.AXIOM_INDEXER_API_KEY,
      });
      if (!auth.ok) {
        sendError(res, auth.status, auth.message, auth.code);
        return;
      }
      const stored = events.append({
        source: b.source,
        eventName: b.eventName,
        chainId: b.chainId,
        blockNumber: b.blockNumber,
        txHash: b.txHash ?? null,
        logIndex: b.logIndex,
        payload: b.payload,
      });
      return { stored };
    },
    config,
  );

  createRoute(
    app,
    {
      method: "get",
      path: "/v1/events",
      consumer: "useEventHistory",
      description: "Query events with optional filters",
    },
    async (_parsed, req, _res) => {
      const limitRaw =
        typeof req.query.limit === "string"
          ? Number(req.query.limit)
          : undefined;
      const limit =
        limitRaw !== undefined && Number.isInteger(limitRaw) && limitRaw > 0
          ? Math.min(limitRaw, MAX_EVENT_QUERY_LIMIT)
          : Math.min(DEFAULT_EVENT_LIMIT, MAX_EVENT_QUERY_LIMIT);
      const sinceRaw =
        typeof req.query.since === "string"
          ? Number(req.query.since)
          : undefined;
      const since =
        sinceRaw !== undefined && !isNaN(sinceRaw) && sinceRaw > 0
          ? sinceRaw
          : undefined;
      const eventName = req.query.eventName as string | undefined;
      const all = events.getAll(limit, since, eventName);
      const owner = req.query.owner as string | undefined;
      const ownerFiltered = owner
        ? all.filter((e) => {
            const payload = e.payload as Record<string, unknown>;
            return (
              payload?.owner === owner ||
              payload?.to === owner ||
              payload?.from === owner
            );
          })
        : all;
      return { events: ownerFiltered };
    },
    config,
  );
}
