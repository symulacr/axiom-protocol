import { Router, type Request, type Response } from "express";
import type { JsonRpcProvider } from "ethers";
import type { OracleClient } from "../oracle/client.js";
import { HTTP } from "@axiom/config";
import { createLogger } from "../utils/logger.js";
import { sendError, extractErrorMessage } from "../utils/response.js";
import type { ServerConfig } from "../server.js";
import { createRoute } from "./route-factory.js";

const log = createLogger("health");

const DEFAULT_PROBE_TTL_MS = 3_000;
const STALE_OK_MS = 30_000;

type HealthSnapshot = {
  chainHead: number;
  oracleUp: boolean;
  ok: boolean;
  checkedAt: number;
};

function probeTtlMs(): number {
  const n = Number.parseInt(process.env.AXIOM_HEALTH_CACHE_MS ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PROBE_TTL_MS;
}

export function createHealthRouter(
  provider: JsonRpcProvider,
  oracle: OracleClient,
  config: ServerConfig,
): Router {
  const router = Router();
  const signerAddress = config.signer.address;
  const addresses = config.addresses;
  let snapshot: HealthSnapshot | null = null;
  let inflight: Promise<HealthSnapshot> | null = null;

  async function probe(): Promise<HealthSnapshot> {
    const [chainHead, oracleHealth] = await Promise.all([
      provider.getBlockNumber().catch(() => 0),
      oracle.health().catch(() => null),
    ]);
    const oracleUp = oracleHealth?.ok === true;
    const ok = chainHead > 0 && oracleUp;
    return { chainHead, oracleUp, ok, checkedAt: Date.now() };
  }

  function resolveSnapshot(): HealthSnapshot | Promise<HealthSnapshot> {
    const ttl = probeTtlMs();
    const now = Date.now();
    if (snapshot && now - snapshot.checkedAt < ttl) {
      return snapshot;
    }

    if (!inflight) {
      inflight = probe()
        .then((fresh) => {
          snapshot = fresh;
          return fresh;
        })
        .catch((err) => {
          if (snapshot && now - snapshot.checkedAt < STALE_OK_MS) {
            log.warn("health probe failed — serving stale snapshot", {
              error: extractErrorMessage(err),
              ageMs: now - snapshot.checkedAt,
            });
            return snapshot;
          }
          const failed: HealthSnapshot = {
            chainHead: 0,
            oracleUp: false,
            ok: false,
            checkedAt: now,
          };
          return failed;
        })
        .finally(() => {
          inflight = null;
        });
    }

    return inflight;
  }

  createRoute(
    router,
    {
      path: "/health/live",
      method: "get",
      consumer: "health",
      description: "Liveness probe",
    },
    async (_parsed: unknown, _req: Request, res: Response) => {
      res.status(HTTP.OK).json({ ok: true, live: true });
    },
    config,
  );

  createRoute(
    router,
    {
      path: "/health",
      method: "get",
      consumer: "health",
      description: "Health check",
    },
    async (_parsed: unknown, _req: Request, res: Response) => {
      try {
        const s = await resolveSnapshot();
        res.status(s.ok ? HTTP.OK : HTTP.SERVICE_UNAVAILABLE).json({
          ok: s.ok,
          version: "0.1.0",
          signer: signerAddress,
          chainHead: s.chainHead,
          oracle: s.oracleUp ? "up" : "down",
          addresses: addresses ?? null,
        });
      } catch (err) {
        log.error("health check failed", {
          error: extractErrorMessage(err),
        });
        sendError(res, HTTP.SERVICE_UNAVAILABLE, "Health check failed");
      }
    },
    config,
  );

  return router;
}
