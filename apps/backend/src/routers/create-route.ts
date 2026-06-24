import { type Express, type Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import type { ServerConfig } from "../server.js";
import { broadcast } from "../ws/broadcaster.js";

/** Minimal route-method interface shared by Express app and Router. */
interface RouteMethodHost {
  get: Express["get"];
  post: Express["post"];
}

export interface CreateRouteOptions<T> {
  path: string;
  method?: "get" | "post";
  schema?: z.ZodSchema<T>;
  requireId?: boolean;
  requireAddress?: string;
  broadcast?: string;
}

export type RouteHandler<T> = (
  parsed: T,
  req: Request,
  res: Response,
  ctx: { id: string; config: ServerConfig },
) => Promise<Record<string, unknown> | void>;

export function createRoute<T>(
  app: Express | Router,
  options: CreateRouteOptions<T>,
  handler: RouteHandler<T>,
  config: ServerConfig,
): void {
  const method = options.method ?? "post";
  (app as unknown as RouteMethodHost)[method](options.path, async (req: Request, res: Response, next: NextFunction) => {
    try {
      let id: string | undefined;

      if (options.requireId) {
        const raw = req.params.id;
        if (typeof raw !== "string") {
          res.status(400).json({ error: "Missing id" });
          return;
        }
        id = raw;
      }

      if (options.requireAddress) {
        const addrs = config.addresses as Record<string, `0x${string}` | undefined> | undefined;
        if (!addrs || !addrs[options.requireAddress]) {
          const label =
            options.requireAddress.charAt(0).toUpperCase() + options.requireAddress.slice(1);
          res.status(500).json({ error: `${label} address not configured` });
          return;
        }
      }

      const parsed = options.schema ? options.schema.parse(req.body) : undefined;
      const result = await handler(parsed as unknown as T, req, res, { id: id!, config });

      if (result !== undefined) {
        res.json({ ok: true, ...result });
        if (options.broadcast) {
          broadcast(options.broadcast, result);
        }
      }
    } catch (err) {
      next(err);
    }
  });
}
