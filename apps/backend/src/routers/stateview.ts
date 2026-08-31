import { STATE_VIEW_ABI } from "@axiom/config/abis";
import type { Express } from "express";
import { createRoute } from "./route-factory.js";
import { routeMeta } from "./shared.js";
import { createLogger } from "../utils/logger.js";
import { TTLCache, extractErrorMessage, sendError } from "../utils/response.js";
import type { ServerConfig } from "../config-types.js";
import type { ethers } from "ethers";
import { TypedContract } from "@axiom/config/types/contract";
import { HTTP } from "@axiom/config/constants";

const log = createLogger("stateview");

/** Return shape of AxiomStateView.paymentSnapshot (V3 W2 single-primitive caps). */
export interface PaymentSnapshot {
  maxPayCap: string;
  computeRatioMax: string;
  agentBalance: string;
  payerAllowance: string;
  paymentToken: string;
}

/** Return shape of AxiomStateView.vaultHealthOf. */
export interface VaultHealth {
  balance: string;
  strategyRoot: string;
  dailyLimit: string;
  dailySpent: string;
  resetDay: string;
  validUntilDay: string;
  expired: boolean;
}

export interface AgentStateResponse {
  tokenId: string;
  payer?: PaymentSnapshot;
  vaultHealth?: VaultHealth;
  errors?: Record<string, string>;
}

type ViewMethods = {
  paymentSnapshot(
    payer: string,
    tokenId: bigint,
  ): Promise<{
    maxPayCap: bigint;
    computeRatioMax: bigint;
    agentBalance: bigint;
    payerAllowance: bigint;
    paymentToken: string;
  }>;
  vaultHealthOf(tokenId: bigint): Promise<{
    balance: bigint;
    strategyRoot: string;
    dailyLimit: bigint;
    dailySpent: bigint;
    resetDay: bigint;
    validUntilDay: bigint;
    expired: boolean;
  }>;
};

function toStrings(v: {
  maxPayCap: bigint;
  computeRatioMax: bigint;
  agentBalance: bigint;
  payerAllowance: bigint;
  paymentToken: string;
}): PaymentSnapshot {
  return {
    maxPayCap: v.maxPayCap.toString(),
    computeRatioMax: v.computeRatioMax.toString(),
    agentBalance: v.agentBalance.toString(),
    payerAllowance: v.payerAllowance.toString(),
    paymentToken: v.paymentToken,
  };
}

function toStrings2(v: {
  balance: bigint;
  strategyRoot: string;
  dailyLimit: bigint;
  dailySpent: bigint;
  resetDay: bigint;
  validUntilDay: bigint;
  expired: boolean;
}): VaultHealth {
  return {
    balance: v.balance.toString(),
    strategyRoot: v.strategyRoot,
    dailyLimit: v.dailyLimit.toString(),
    dailySpent: v.dailySpent.toString(),
    resetDay: v.resetDay.toString(),
    validUntilDay: v.validUntilDay.toString(),
    expired: v.expired,
  };
}

/**
 * GET /v1/agents/:id/state — one-call pre-flight view over AxiomStateView
 * (paymentSnapshot + vaultHealthOf) replacing the FE's fan-out of per-contract
 * calls. Both reads are optional: each reports its failure in `errors` so a
 * partial outage degrades instead of 500ing the whole snapshot. Payer scoping
 * comes from ?payer=0x… (defaults to the zero address = aggregate view).
 */
export function registerStateViewRoutes(
  app: Express,
  config: ServerConfig,
  provider: ethers.JsonRpcProvider | ethers.FallbackProvider,
): void {
  const cache = new TTLCache<AgentStateResponse>(10_000);

  createRoute(
    app,
    routeMeta(
      "/v1/agents/:id/state",
      "agents",
      "Pre-flight agent state from AxiomStateView: paymentSnapshot(payer, tokenId) + vaultHealthOf(tokenId) in one call",
      { method: "get", requireId: true, requireAddress: "stateView" },
    ),
    async (_parsed: unknown, req, res, { id, config: cfg }) => {
      const payer =
        typeof req.query.payer === "string" ? req.query.payer : undefined;
      const tokenId = BigInt(id);

      res.setHeader("Cache-Control", "public, max-age=10");
      const cacheKey = `${tokenId}:${(payer ?? "").toLowerCase()}`;
      const cached = cache.get(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }

      // requireAddress guard already 503s (ADDRESS_NOT_CONFIGURED) when stateView is unset.
      const stateViewAddr = cfg.addresses!.stateView;
      if (!stateViewAddr)
        return sendError(
          res,
          HTTP.SERVICE_UNAVAILABLE,
          "stateView address not configured",
          "ADDRESS_NOT_CONFIGURED",
        );
      const tc = new TypedContract<ViewMethods>(
        stateViewAddr,
        STATE_VIEW_ABI,
        provider,
      );

      const result: AgentStateResponse = { tokenId: tokenId.toString() };
      const errors: Record<string, string> = {};

      // ethers treats any non-fully-padded-40-hex string as an ENS name
      // (resolveName); lowercase so mixed-case input never takes that path
      // and providers without a resolver (fake tests) still answer.
      const payerRaw = payer ?? `0x${"0".repeat(40)}`;
      const payerKey = payerRaw.toLowerCase() as `0x${string}`;
      const [snapshot, health] = await Promise.allSettled([
        tc.contract.paymentSnapshot(payerKey, tokenId),
        tc.contract.vaultHealthOf(tokenId),
      ]);
      if (snapshot.status === "fulfilled") {
        result.payer = toStrings(snapshot.value);
      } else {
        errors.paymentSnapshot = extractErrorMessage(snapshot.reason);
      }
      if (health.status === "fulfilled") {
        result.vaultHealth = toStrings2(health.value);
      } else {
        errors.vaultHealthOf = extractErrorMessage(health.reason);
      }
      if (Object.keys(errors).length > 0) result.errors = errors;

      // Total failure (both reads failed) → 502; partial failure → 200 + errors.
      if (!result.payer && !result.vaultHealth) {
        log.warn("stateview reads failed", { tokenId, errors });
        sendError(
          res,
          HTTP.BAD_GATEWAY,
          `stateview reads failed: ${JSON.stringify(errors)}`,
        );
        return;
      }

      cache.set(cacheKey, result);
      res.json(result);
    },
    config,
  );
}
