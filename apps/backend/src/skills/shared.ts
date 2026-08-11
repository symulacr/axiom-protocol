import { Router } from "express";
import type { z } from "zod";
import type { ServerConfig } from "../server.js";
import {
  createRoute,
  type RouteOptions,
  type RouteHandler,
} from "../routers/route-factory.js";
import { getSharedProvider } from "../provider.js";
import { TTLCache } from "../utils/response.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("skills:shared");

export function serialize(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(serialize);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = serialize(val);
    }
    return out;
  }
  return v;
}

interface LogFilter {
  address?: string;
  topics?: (string | string[] | null)[];
  fromBlock: number;
  toBlock: number;
}

interface RpcLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  transactionIndex: string;
  blockHash: string;
  logIndex: string;
  removed: boolean;
}

export async function* getLogsChunked(
  filter: LogFilter,
  chunkSize = 2_000,
): AsyncGenerator<RpcLog[]> {
  const provider = getSharedProvider();
  let from = filter.fromBlock;
  const end = filter.toBlock;

  while (from <= end) {
    let to = Math.min(from + chunkSize - 1, end);
    let success = false;

    while (!success) {
      const params = {
        fromBlock: "0x" + from.toString(16),
        toBlock: "0x" + to.toString(16),
        ...(filter.address ? { address: filter.address } : {}),
        ...(filter.topics ? { topics: filter.topics } : {}),
      };

      try {
        const logs: RpcLog[] = await provider.send("eth_getLogs", [params]);
        yield logs;
        success = true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (to === from) {
          log.warn("eth_getLogs failed on single block, skipping", {
            block: from,
            error: msg,
          });
          success = true;
        } else {
          const mid = Math.floor((from + to) / 2);
          log.debug("eth_getLogs chunk too large, halving", {
            from,
            to,
            newTo: mid,
          });
          to = mid;
        }
      }
    }

    from = to + 1;
  }
}

export interface SkillRouter {
  router: Router;
  route: <S extends z.ZodTypeAny | undefined = undefined>(
    opts: RouteOptions<S>,
    handler: RouteHandler<S extends z.ZodTypeAny ? z.infer<S> : unknown>,
  ) => void;
}

export function createSkillRouter(config: ServerConfig): SkillRouter {
  const router = Router();
  const route = <S extends z.ZodTypeAny | undefined = undefined>(
    opts: RouteOptions<S>,
    handler: RouteHandler<S extends z.ZodTypeAny ? z.infer<S> : unknown>,
  ): void => {
    createRoute(router, { consumer: "chat-runtime", ...opts }, handler, config);
  };
  return { router, route };
}

interface CachedJsonGetOptions {
  headers?: Record<string, string>;
  ttlMs: number;
}

export function cachedJsonGet(
  baseUrl: string,
  opts: CachedJsonGetOptions,
): (key: string, path: string, init?: RequestInit) => Promise<unknown> {
  const cache = new TTLCache<unknown>(opts.ttlMs);
  const baseHeaders = opts.headers ?? {};
  return async (key, path, init) => {
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { ...baseHeaders, ...init?.headers },
    });
    if (!res.ok) {
      throw Object.assign(new Error(`Upstream ${res.status} for ${path}`), {
        status: 502,
      });
    }
    const data = await res
      .json()
      .catch(() =>
        Object.assign(
          new Error(`Upstream returned non-JSON body for ${path}`),
          { status: 502 },
        ),
      );
    cache.set(key, data);
    return data;
  };
}
