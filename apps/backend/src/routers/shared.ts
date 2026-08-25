import type { z } from "zod";
import { REGISTERED_ROUTES, type RouteOptions } from "./route-factory.js";

// Metadata-only registration for routes mounted without createRoute (WS upgrade, oracle, MCP)
// so GET /v1/routes stays a complete map.
export function pushRouteMeta(
  ...entries: readonly (readonly [
    method: "GET" | "POST" | "DELETE",
    path: string,
    consumer: string,
    description: string,
  ])[]
): void {
  for (const [method, path, consumer, description] of entries)
    REGISTERED_ROUTES.push({ method, path, consumer, description });
}

/** Positional shorthand for createRoute's option literal (method defaults to post). */
export function routeMeta<S extends z.ZodTypeAny | undefined = undefined>(
  path: string,
  consumer: string,
  description: string,
  extra?: Omit<RouteOptions<S>, "path" | "consumer" | "description">,
): RouteOptions<S> {
  return { path, consumer, description, ...extra };
}
