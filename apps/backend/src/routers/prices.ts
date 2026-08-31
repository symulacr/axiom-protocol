import type { Express } from "express";
import { HTTP } from "@axiom/config/constants";
import { createRoute } from "./route-factory.js";
import { routeMeta } from "./shared.js";
import { sendError } from "../utils/response.js";
import { pythPricesOrEmpty } from "../oracle/pyth.js";
import type { ServerConfig } from "../config-types.js";

/**
 * Public market-data surface (V3 W6-B, v1 off-chain Pyth prices): the FE swap
 * UI and chat read it for slippage sanity. No contract dependency — Hermes
 * unreachable degrades to 503 PRICES_UNAVAILABLE, never a fabricated price.
 */
export function registerPriceRoutes(app: Express, config: ServerConfig): void {
  createRoute(
    app,
    routeMeta(
      "/v1/prices",
      "swap-ui",
      "Pyth latest prices for the top-15 feed map (30s cache; read route)",
      { method: "get" },
    ),
    async (_parsed, _req, res) => {
      const { ok, prices, error } = await pythPricesOrEmpty();
      if (!ok) {
        return sendError(
          res,
          HTTP.SERVICE_UNAVAILABLE,
          `price feed unavailable: ${error ?? "unknown"}`,
          "PRICES_UNAVAILABLE",
        );
      }
      res.setHeader("Cache-Control", "public, max-age=30");
      return { prices };
    },
    config,
  );
}
