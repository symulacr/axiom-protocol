import { Router } from "express";
import { z } from "zod";
import type { ServerConfig } from "../server.js";
import { createRoute } from "./route-factory.js";
import {
  archiveAccountSchema,
  archiveClosestSchema,
  archiveConfirmSchema,
  archiveLookupSchema,
  archiveUrlSchema,
} from "../route-schemas.js";
import {
  closestSnapshot,
  confirmArchived,
  lookupAccountTweets,
  lookupSnapshots,
} from "../services/wayback.js";
import { queryArchive } from "../services/archive.js";

const archiveQuerySchema = z.object({
  intent: z.enum(["lookup", "confirm", "account", "closest"]).default("lookup"),
  url: archiveUrlSchema.optional(),
  handle: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  timestamp: z.string().optional(),
  fullList: z.boolean().optional(),
});

export function createArchiveQueryRouter(config: ServerConfig): Router {
  const router = Router();

  createRoute(
    router,
    {
      path: "/v1/archive/query",
      method: "post",
      schema: archiveQuerySchema,
      consumer: "chat-runtime",
      description: "Unified archive facade (closest-first lookup, confirm, account)",
    },
    async (parsed) => queryArchive(parsed),
    config,
  );

  createRoute(
    router,
    {
      path: "/v1/archive/snapshots",
      method: "get",
      schema: archiveLookupSchema,
      consumer: "chat-runtime",
      description: "List all Wayback snapshots for a URL",
    },
    async (parsed: { url: string; limit?: number }) => {
      const snapshots = await lookupSnapshots(parsed.url, parsed.limit ?? 50);
      return { url: parsed.url, count: snapshots.length, snapshots };
    },
    config,
  );

  createRoute(
    router,
    {
      path: "/v1/archive/account",
      method: "post",
      schema: archiveAccountSchema,
      consumer: "chat-runtime",
      description: "List all archived tweets for an X/Twitter handle",
    },
    async (parsed: { handle: string; limit?: number }) => {
      const snapshots = await lookupAccountTweets(
        parsed.handle,
        parsed.limit ?? 100,
      );
      return { handle: parsed.handle, count: snapshots.length, snapshots };
    },
    config,
  );

  createRoute(
    router,
    {
      path: "/v1/archive/confirm",
      method: "post",
      schema: archiveConfirmSchema,
      consumer: "chat-runtime",
      description: "Confirm a URL was archived (deletion-evidence)",
    },
    async (parsed: { url: string }) => confirmArchived(parsed.url),
    config,
  );

  createRoute(
    router,
    {
      path: "/v1/archive/closest",
      method: "get",
      schema: archiveClosestSchema,
      consumer: "chat-runtime",
      description: "Closest Wayback snapshot to a timestamp",
    },
    async (parsed: { url: string; timestamp?: string }) => {
      const snapshot = await closestSnapshot(parsed.url, parsed.timestamp);
      return { url: parsed.url, snapshot };
    },
    config,
  );

  return router;
}