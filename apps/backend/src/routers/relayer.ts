import { verifyTypedData } from "ethers";
import type { Express } from "express";
import {
  HTTP,
  GAS_TANK_FORWARD_REQUEST_TYPES,
  getRelayerConfig,
} from "@axiom/config";
import { GAS_TANK_ABI } from "@axiom/config/abis";
import {
  GAS_TANK_DOMAIN_NAME,
  GAS_TANK_DOMAIN_VERSION,
} from "@axiom/config/eip712";
import { TypedContract } from "@axiom/config/types/contract";
import { createRoute } from "./route-factory.js";
import { routeMeta } from "./shared.js";
import { sponsorBodySchema } from "../route-schemas.js";
import type { ServerConfig } from "../config-types.js";
import type { ethers } from "ethers";
import type {
  RelayerQueue,
  SponsorRecord,
  RelaySubmitter,
} from "../relayer/queue.js";
import type { SponsorGate } from "../relayer/sponsor.js";
import type { ReconcileEngine } from "../relayer/reconcile.js";
import type { Faucet } from "../relayer/faucet.js";
import { sendError } from "../utils/response.js";
import { createLogger } from "../utils/logger.js";

// ethers TypedData wants mutable field arrays; the config constant is readonly.
const FORWARD_REQUEST_TYPES = {
  ForwardRequest: GAS_TANK_FORWARD_REQUEST_TYPES.ForwardRequest.map((f) => ({
    ...f,
  })),
} as const;

const log = createLogger("relayer.routes");

/** Internal signal: faucet dep absent (relayer off) → 503 ADDRESS_NOT_CONFIGURED. */
class FaucetUnavailable extends Error {}

export interface RelayerRouteDeps {
  queue: RelayerQueue;
  gate: SponsorGate;
  reconcile: ReconcileEngine;
  /** First-relay axmUSDC faucet (V3 W6-B); optional — routes 503 without it. */
  faucet?: Faucet;
  /** Broadcast leg (relayer key signs relay()); injected for test mocking. */
  submit: RelaySubmitter;
  /** Simulate-before-queue leg: provider.call against the GasTank. Throws on revert. */
  simulate: (
    record: Omit<SponsorRecord, "id" | "status" | "enqueuedAt" | "attempts">,
  ) => Promise<void>;
  gasTankAddress?: `0x${string}`;
  relayerAddress?: string;
}

/** Relayed terminal state pushed to clients once the op confirms (or dead-letters). */
export interface SponsorAccepted {
  ok: true;
  id: string;
  nonce: string;
  sponsored: true;
}

type TankViews = {
  balanceOf(user: string): Promise<bigint>;
  /** Public mapping getter — lane A exposes grants as grantsUsed (no grantsOf). */
  grantsUsed(user: string): Promise<bigint>;
  gasGrant(): Promise<bigint>;
  grantsCap(): Promise<bigint>;
  reserve(): Promise<bigint>;
  /** Public mapping — sequential per-user nonce counter (next-nonce semantics). */
  nonces(user: string): Promise<bigint>;
};

export function tankResponse(
  address: string,
  v: {
    balance: bigint;
    grants: bigint;
    grantsCap: bigint;
    gasGrant: bigint;
    reserve: bigint;
  },
): Record<string, string | number> {
  const grantsLeft = v.grantsCap > v.grants ? v.grantsCap - v.grants : 0n;
  const opsLeft = v.gasGrant > 0n ? Number(v.balance / v.gasGrant) : 0;
  return {
    address,
    balance: v.balance.toString(),
    grants: v.grants.toString(),
    grantsCap: v.grantsCap.toString(),
    grantsLeft: grantsLeft.toString(),
    gasGrant: v.gasGrant.toString(),
    opsLeft: Math.min(opsLeft, Number(grantsLeft) + 1_000_000),
    reserve: v.reserve.toString(),
  };
}

/**
 * V3 W5-B relayer surface:
 *  - POST /v1/relayer/sponsor — EIP-712 forward-request admission (recover →
 *    simulate → gate → queue); TankExhausted reverts map to 402 TANK_EXHAUSTED.
 *  - GET  /v1/relayer/tank/:address — tank balance/grants view (read route).
 *  - GET  /v1/relayer/status — relayer mode + queue stats.
 * V3 W6-B faucet surface:
 *  - GET  /v1/relayer/faucet/:address — drip eligibility read (balance + set).
 *  - POST /v1/relayer/faucet/:address — claim: enqueues the drip directly
 *    (mint is permissionless; no user signature involved).
 * All routes 503 ADDRESS_NOT_CONFIGURED while the GasTank address is unset
 * (lane A deploy pending).
 */
export function registerRelayerRoutes(
  app: Express,
  config: ServerConfig,
  provider: ethers.JsonRpcProvider | ethers.FallbackProvider,
  deps?: RelayerRouteDeps,
): void {
  const chainId = config.env?.AXIOM_CHAIN_ID;
  const cfg = getRelayerConfig();

  createRoute(
    app,
    routeMeta(
      "/v1/relayer/status",
      "relayer",
      "Relayer mode + queue stats (V3 W5-B)",
      { method: "get" },
    ),
    async () => {
      const enabled = deps !== undefined && deps.gasTankAddress !== undefined;
      return {
        mode: enabled ? "on" : "off",
        address: deps?.gasTankAddress ?? null,
        relayer: deps?.relayerAddress ?? null,
        sponsorMaxGasCostWei: cfg.sponsorMaxGasCostWei.toString(),
        sponsorRatePerMin: cfg.sponsorRatePerMin,
        sponsorMaxInflightPerUser: cfg.sponsorMaxInflightPerUser,
        batchMax: cfg.batchMax,
        queue: deps
          ? Object.fromEntries(
              Object.entries(
                deps.queue.all().reduce<Record<string, number>>((acc, r) => {
                  acc[r.status] = (acc[r.status] ?? 0) + 1;
                  return acc;
                }, {}),
              ),
            )
          : { queued: 0, submitted: 0, confirmed: 0, "dead-lettered": 0 },
      };
    },
    config,
  );

  createRoute(
    app,
    routeMeta(
      // :address param (not requireId: that guard is numeric-only for tokenId
      // routes). The requireAddress-style 503 lives in the handler below so the
      // route still self-describes while the GasTank address is unset.
      "/v1/relayer/tank/:address",
      "relayer",
      "GasTank balance/grants view for an address (read route)",
      { method: "get", requireAddress: "gasTank" },
    ),
    async (_parsed, _req, res, { id, config: cfgSrv }) => {
      // requireAddress guard already 503s when the gasTank address is unset.
      const gasTank = cfgSrv.addresses!.gasTank as `0x${string}`;
      const tc = new TypedContract<TankViews>(gasTank, GAS_TANK_ABI, provider);
      try {
        const [balance, grants, grantsCapV, gasGrant, reserve, nextNonce] =
          await Promise.all([
            tc.contract.balanceOf(id),
            tc.contract.grantsUsed(id),
            tc.contract.grantsCap(),
            tc.contract.gasGrant(),
            tc.contract.reserve(),
            tc.contract.nonces(id),
          ]);
        res.setHeader("Cache-Control", "no-store");
        return {
          ...tankResponse(id, {
            balance,
            grants,
            grantsCap: grantsCapV,
            gasGrant,
            reserve,
          }),
          // Sequential next-nonce (lane A): the nonce the NEXT ForwardRequest must carry.
          nextNonce: nextNonce.toString(),
        };
      } catch (err) {
        log.warn(
          `tank read failed for ${id}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return sendError(
          res,
          HTTP.BAD_GATEWAY,
          "tank read failed",
          "UPSTREAM_ERROR",
        );
      }
    },
    config,
  );

  createRoute(
    app,
    routeMeta(
      "/v1/relayer/sponsor",
      "relayer",
      "Submit an EIP-712 ForwardRequest for sponsored relay (gas-free op)",
      { schema: sponsorBodySchema, requireAddress: "gasTank" },
    ),
    async (
      parsed: {
        user: `0x${string}`;
        target: `0x${string}`;
        data: `0x${string}`;
        maxGasCost: string;
        nonce: string;
        deadline: string;
        signature: `0x${string}`;
      },
      _req,
      res,
    ) => {
      if (!deps) {
        return sendError(
          res,
          HTTP.SERVICE_UNAVAILABLE,
          "relayer not enabled (AXIOM_RELAYER_MODE=off or gasTank unset)",
          "ADDRESS_NOT_CONFIGURED",
        );
      }

      const request = {
        user: parsed.user,
        target: parsed.target,
        data: parsed.data,
        maxGasCost: BigInt(parsed.maxGasCost),
        nonce: BigInt(parsed.nonce),
        deadline: BigInt(parsed.deadline),
      };

      // Recover the EIP-712 signer — admission keys off the RECOVERED address,
      // never the client-declared user field.
      let recovered: string;
      try {
        recovered = verifyTypedData(
          {
            name: GAS_TANK_DOMAIN_NAME,
            version: GAS_TANK_DOMAIN_VERSION,
            chainId,
            verifyingContract: config.addresses!.gasTank as `0x${string}`,
          },
          FORWARD_REQUEST_TYPES,
          request,
          parsed.signature,
        );
      } catch {
        return sendError(
          res,
          HTTP.BAD_REQUEST,
          "invalid signature",
          "INVALID_SIGNATURE",
        );
      }
      if (recovered.toLowerCase() !== request.user.toLowerCase()) {
        return sendError(
          res,
          HTTP.BAD_REQUEST,
          "signature does not recover to user",
          "INVALID_SIGNER",
        );
      }
      if (BigInt(Math.floor(Date.now() / 1000)) > request.deadline) {
        return sendError(
          res,
          HTTP.BAD_REQUEST,
          "deadline passed",
          "DEADLINE_PASSED",
        );
      }

      // Sponsor economics: user-signed maxGasCost must fit the operator cap.
      if (!deps.gate.allowsMaxGasCost(request.maxGasCost)) {
        return sendError(
          res,
          HTTP.PAYMENT_REQUIRED,
          "maxGasCost exceeds the sponsored ceiling",
          "MAX_GAS_COST_EXCEEDED",
        );
      }

      const record = {
        request,
        userSig: parsed.signature,
        user: recovered.toLowerCase(),
      };

      // Simulate before queueing (relayer never pays to mine a doomed relay).
      try {
        await deps.simulate(record);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("TankExhausted")) {
          return sendError(
            res,
            HTTP.PAYMENT_REQUIRED,
            "gas tank exhausted — grants cap reached for this address",
            "TANK_EXHAUSTED",
          );
        }
        // Lane A delta: contract error is ReserveExhausted (spec draft said ReserveDepleted).
        if (
          msg.includes("ReserveExhausted") ||
          msg.includes("ReserveDepleted")
        ) {
          return sendError(
            res,
            HTTP.SERVICE_UNAVAILABLE,
            "protocol gas reserve exhausted — try again later",
            "RESERVE_EXHAUSTED",
          );
        }
        return sendError(
          res,
          HTTP.BAD_REQUEST,
          `simulation failed: ${msg}`,
          "SIMULATION_FAILED",
        );
      }

      // Per-user token bucket (keyed on the recovered signer).
      if (!deps.gate.takeToken(recovered)) {
        return sendError(
          res,
          HTTP.TOO_MANY,
          "sponsor rate limit exceeded — retry shortly",
          "SPONSOR_RATE_LIMITED",
        );
      }

      // Queue enforces the per-user inflight cap (reservation accounting).
      const queued = deps.queue.enqueue(record);
      if (!queued) {
        return sendError(
          res,
          HTTP.TOO_MANY,
          "too many inflight sponsored ops for this address",
          "SPONSOR_INFLIGHT_LIMIT",
        );
      }

      // V3 W6-B: first sponsored relay from this address → enqueue the one-time
      // axmUSDC drip (relayer-initiated mint, no user signature). Fire-and-
      // forget: a failure here never blocks the user op.
      if (deps.faucet) {
        void deps.faucet.dripOnFirstRelay(recovered);
      }

      void deps
        .submit(queued)
        .then((txHash) => {
          queued.txHash = txHash;
        })
        .catch((err: unknown) => {
          deps.queue.markFailed(
            queued.id,
            err instanceof Error ? err.message : String(err),
          );
        });

      const body: SponsorAccepted = {
        ok: true,
        id: queued.id,
        nonce: request.nonce.toString(),
        sponsored: true,
      };
      res.status(HTTP.ACCEPTED).json(body);
    },
    config,
  );

  // ── V3 W6-B faucet (testnet mock-token drip) ──────────────────────────
  // Two registrations: createRoute's routeFn mounts ONE method per call, so
  // GET and POST are separate createRoute invocations on the same path.
  const faucetGuard = (): Faucet => {
    if (!deps?.faucet) {
      throw new FaucetUnavailable();
    }
    return deps.faucet;
  };
  createRoute(
    app,
    routeMeta(
      // :address param (not requireId: that guard is numeric-only for tokenId
      // routes); malformed addresses are rejected in the handler below.
      "/v1/relayer/faucet/:address",
      "relayer",
      "Testnet axmUSDC faucet eligibility for an address (read route)",
      { method: "get" },
    ),
    async (_parsed, req, res) => {
      let faucet: Faucet;
      try {
        faucet = faucetGuard();
      } catch {
        return sendError(
          res,
          HTTP.SERVICE_UNAVAILABLE,
          "relayer not enabled (AXIOM_RELAYER_MODE=off or gasTank unset)",
          "ADDRESS_NOT_CONFIGURED",
        );
      }
      const id = req.params.address ?? "";
      if (!/^0x[0-9a-fA-F]{40}$/.test(id)) {
        return sendError(
          res,
          HTTP.BAD_REQUEST,
          "invalid address",
          "VALIDATION_ERROR",
        );
      }
      return faucet.statusOf(id);
    },
    config,
  );
  createRoute(
    app,
    routeMeta(
      "/v1/relayer/faucet/:address",
      "relayer",
      "Claim the one-time axmUSDC drip (relayer-initiated mint; no user signature)",
      {},
    ),
    async (_parsed, req, res) => {
      let faucet: Faucet;
      try {
        faucet = faucetGuard();
      } catch {
        return sendError(
          res,
          HTTP.SERVICE_UNAVAILABLE,
          "relayer not enabled (AXIOM_RELAYER_MODE=off or gasTank unset)",
          "ADDRESS_NOT_CONFIGURED",
        );
      }
      const address = req.params.address ?? "";
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return sendError(
          res,
          HTTP.BAD_REQUEST,
          "invalid address",
          "VALIDATION_ERROR",
        );
      }
      const dripped = await faucet.dripOnFirstRelay(address);
      return dripped
        ? { ok: true, dripped: true }
        : {
            ok: true,
            dripped: false,
            reason: "already fauceted or ineligible",
          };
    },
    config,
  );
}
