import {
  type Request,
  type Response,
  type NextFunction,
  type Router,
  type Express,
} from "express";
import type { ServerConfig } from "../server.js";
import type { z } from "zod";
import { broadcast } from "../ws/broadcaster.js";
import { sendError } from "../utils/response.js";

export interface RouteRegistration {
  method: "GET" | "POST" | "DELETE" | "PUT";
  path: string;
  consumer?: string;
  description?: string;
}

export const REGISTERED_ROUTES: RouteRegistration[] = [];

type AddressKey = keyof NonNullable<ServerConfig["addresses"]>;
export type RouteHandler<T> = (
  parsed: T,
  req: Request,
  res: Response,
  helpers: { id: string; config: ServerConfig },
) => Promise<unknown>;
export interface RouteOptions<S extends z.ZodTypeAny | undefined = undefined> {
  /** Route path (e.g., "/v1/agents/mint") */
  path: string;
  /** HTTP method */
  method?: "get" | "post";
  /** Zod schema for request body validation */
  schema?: S;
  /** If true, req.params.id is required (sets id in helpers) */
  requireId?: boolean;
  /** If set, checks config.addresses[key] exists (e.g. "vault", "agentNft") */
  requireAddress?: AddressKey;
  /** Event name to broadcast on success */
  broadcast?: string;
  /** Frontend hook or consumer name for route registry */
  consumer?: string;
  /** Human-readable description for route registry */
  description?: string;
}

/**
 * Creates an Express route with standardized error handling,
 * address validation, schema parsing, and optional broadcast.
 */
export function createRoute<S extends z.ZodTypeAny | undefined = undefined>(
  app: Router | Express,
  opts: RouteOptions<S>,
  handler: RouteHandler<S extends z.ZodTypeAny ? z.infer<S> : unknown>,
  config: ServerConfig,
): void {
  const method = opts.method ?? "post";
  const routeFn = method === "get" ? app.get.bind(app) : app.post.bind(app);
  REGISTERED_ROUTES.push({
    method: method.toUpperCase() as "GET" | "POST",
    path: opts.path,
    consumer: opts.consumer,
    description: opts.description,
  });
  routeFn(
    opts.path,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (opts.requireId) {
          const idParam =
            typeof req.params.id === "string" ? req.params.id : null;
          if (!idParam) {
            sendError(res, 400, "Missing id");
            return;
          }
          if (!/^\d+$/.test(idParam)) {
            sendError(res, 400, "Invalid id: must be numeric");
            return;
          }
        }
        if (opts.requireAddress && !config.addresses?.[opts.requireAddress]) {
          res
            .status(500)
            .json({ error: `${opts.requireAddress} address not configured` });
          return;
        }
        const parsed = opts.schema
          ? opts.schema.parse(
              method === "get"
                ? req.query
                : (req.body ?? req.query),
            )
          : undefined;
        const id = req.params.id ?? "";
        const result = await handler(
          parsed as S extends z.ZodTypeAny ? z.infer<S> : undefined,
          req,
          res,
          { id, config },
        );
        if (opts.broadcast && result) {
          broadcast(opts.broadcast, result);
        }
        if (!res.headersSent) {
          res.json(result ?? { ok: true });
        }
      } catch (err) {
        next(err);
      }
    },
  );
}
