import express, { type Express } from "express";
import { ethers } from "ethers";
import type { ServerConfig } from "../config-types.js";
import { HTTP } from "@axiom/config/constants";
import type { TypedContract } from "@axiom/config/types/contract";
import { type AgentNFTMethods } from "@axiom/config/types/contract";
import type { PaymentProcessorClient } from "../payment/processor.js";
import { royaltySchema } from "../route-schemas.js";
import { sendError } from "../utils/response.js";
import { TTLCache } from "../utils/response.js";
import { registerVaultRoutes } from "./vault.js";
import { createRoute } from "./route-factory.js";
import { routeMeta } from "./shared.js";

export function registerPaymentRoutes(
  app: Express,
  config: ServerConfig,
  nftTc: TypedContract<AgentNFTMethods> | null,
  getPayment: () => Promise<PaymentProcessorClient>,
): void {
  const paymentRouter = express.Router();
  createRoute(
    paymentRouter,
    routeMeta(
      "/v1/agents/:id/earnings",
      "usePayment",
      "Get agent earnings by token ID",
      {
        method: "get",
        requireId: true,
        requireAddress: "paymentProcessor",
      },
    ),
    async (_parsed, _req, res, { id }) => {
      res.setHeader("Cache-Control", "public, max-age=300");
      if (!nftTc)
        return sendError(
          res,
          HTTP.SERVICE_UNAVAILABLE,
          "AgentNFT address not configured",
        );
      const [creator, client] = await Promise.all([
        nftTc.contract.creatorOf(BigInt(id)),
        getPayment(),
      ]);
      if (!creator || creator === ethers.ZeroAddress)
        return sendError(
          res,
          HTTP.NOT_FOUND,
          "Agent creator not registered for token",
        );
      const earnings = await client.earningsOf(creator);
      return { tokenId: id, creator, earnings };
    },
    config,
  );

  createRoute(
    paymentRouter,
    routeMeta(
      "/v1/agents/:id/royalty",
      "usePayment",
      "Encode royalty set transaction data",
      {
        schema: royaltySchema,
        requireId: true,
        requireAddress: "paymentProcessor",
      },
    ),
    async (parsed: { bps: number }, _req, _res, { id }) => {
      const client = await getPayment();
      const txData = await client.encodeSetRoyalty(BigInt(id), parsed.bps);
      return { tokenId: id, bps: parsed.bps, ...txData };
    },
    config,
  );

  const paymentConfigCache = new TTLCache<{
    paymentToken: string;
    paymentTokenSymbol: string;
    paymentTokenDecimals: number;
    protocolFeeBps: bigint;
    protocolTreasury: string;
  }>(300_000);

  createRoute(
    paymentRouter,
    routeMeta(
      "/v1/payment/config",
      "usePayment",
      "Payment contract configuration (cached 5min)",
      {
        method: "get",
        requireAddress: "paymentProcessor",
      },
    ),
    async (_parsed, _req, res) => {
      res.setHeader("Cache-Control", "public, max-age=300");
      const cached = paymentConfigCache.get("config");
      if (cached) return cached;
      const client = await getPayment();
      const result = await client.protocolConfig();
      paymentConfigCache.set("config", result);
      return result;
    },
    config,
  );

  registerVaultRoutes(paymentRouter, config);

  createRoute(
    paymentRouter,
    routeMeta(
      "/v1/agents/:id/metadata",
      "cli-only",
      "Encode transaction to update agent metadata on-chain",
      { requireId: true, requireAddress: "agentNft" },
    ),
    async (_parsed, req, res, { id, config: cfg }) => {
      const nftAddr = cfg.addresses?.agentNft;
      if (!nftAddr)
        return sendError(res, HTTP.INTERNAL, "AgentNFT address not configured");
      const { datas } = req.body ?? {};
      if (!datas || !Array.isArray(datas))
        return sendError(
          res,
          HTTP.BAD_REQUEST,
          "Missing or invalid datas array",
        );
      if (!nftTc)
        return sendError(res, HTTP.INTERNAL, "AgentNFT not configured");
      const encoded = nftTc.iface.encodeFunctionData("update", [
        BigInt(id),
        datas,
      ]);
      return { to: nftAddr, data: encoded, value: "0" };
    },
    config,
  );

  app.use(paymentRouter);
}
