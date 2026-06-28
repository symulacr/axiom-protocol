import { Router, type Request, type Response } from "express";
import type { JsonRpcProvider } from "ethers";
import type { OracleClient } from "../oracle/client.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("health");
export function createHealthRouter(provider: JsonRpcProvider, oracle: OracleClient, signerAddress: string, addresses: Record<string, string> | null | undefined): Router {
  const router = Router();

  router.get("/health", async (_req: Request, res: Response) => {
    try {
      const [chainHead, oracleHealth] = await Promise.all([
        provider.getBlockNumber().catch(() => 0),
        oracle.health().catch(() => null),
      ]);
      const healthy = chainHead > 0;
      res.status(healthy ? 200 : 503).json({
        ok: healthy,
        version: "0.1.0",
        signer: signerAddress,
        chainHead,
        oracle: oracleHealth?.ok === true ? "up" : "down",
        addresses: addresses ?? null,
      });
    } catch (err) {
      log.error("health check failed", { error: err instanceof Error ? err.message : String(err) });
      res.status(503).json({ ok: false, error: "Health check failed" });
    }
  });

  return router;
}
