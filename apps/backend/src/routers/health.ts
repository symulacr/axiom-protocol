import { Router, type Request, type Response } from "express";
import { hexlify, type JsonRpcProvider } from "ethers";
import type { TeeSigner } from "../oracle/signer.js";
import { HTTP } from "@axiom/config";
import { createLogger } from "../utils/logger.js";
import { sendError, extractErrorMessage, envInt } from "../utils/response.js";
import type { ServerConfig } from "../server.js";
import { createRoute } from "./route-factory.js";
import pkg from "../../package.json" with { type: "json" };

const PKG_VERSION = pkg.version;
const log = createLogger("health");

const DEFAULT_PROBE_TTL_MS = 3_000;
const STALE_OK_MS = 30_000;

type HealthSnapshot = {
  chainHead: number;
  ok: boolean;
  checkedAt: number;
};

function probeTtlMs(): number {
  return envInt("AXIOM_HEALTH_CACHE_MS", DEFAULT_PROBE_TTL_MS);
}

export function createHealthRouter(
  provider: JsonRpcProvider,
  teeSigner: TeeSigner,
  config: ServerConfig,
): Router {
  const router = Router();
  const signerAddress = config.signer.address;
  const addresses = config.addresses;
  let snapshot: HealthSnapshot | null = null;
  let inflight: Promise<HealthSnapshot> | null = null;

  async function probe(): Promise<HealthSnapshot> {
    // The TEE signer is in-process (boot fails without AXIOM_TEE_SIGNER_PK), so the
    // probe only needs chain health — no HTTP oracle round-trip.
    const chainHead = await provider.getBlockNumber().catch(() => 0);
    const ok = chainHead > 0;
    return { chainHead, ok, checkedAt: Date.now() };
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
          version: PKG_VERSION,
          signer: signerAddress,
          chainHead: s.chainHead,
          oracle: "up",
          oracleSigner: teeSigner.address,
          uncompressedPubkey: hexlify(teeSigner.uncompressedPubkey),
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
