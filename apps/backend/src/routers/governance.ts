import {
  AGENT_NFT_ABI,
  PAYMENT_PROCESSOR_ABI,
  TEE_VERIFIER_ABI,
} from "@axiom/config/abis";
import type { Express } from "express";
import { createRoute } from "./route-factory.js";
import { routeMeta } from "./shared.js";
import { createLogger } from "../utils/logger.js";
import { TTLCache, extractErrorMessage } from "../utils/response.js";
import type { ServerConfig } from "../config-types.js";
import type { ethers } from "ethers";
import { TypedContract } from "@axiom/config/types/contract";

const log = createLogger("governance");

type PendingStatus = "idle" | "pending";

export interface TimelockEntry {
  key: string;
  contract: string;
  currentAddress: string | null;
  pendingAddress: string | null;
  executableAt: string | null;
  status: PendingStatus;
  executableIn: number | null;
}

export interface TimelockResponse {
  entries: TimelockEntry[];
  asOfBlock: number | null;
}

/** Contract method triple for one timelocked rotation slot. */
interface TimelockViews {
  pending: string;
  executableAt?: string;
}

type ViewMethods = Record<string, () => Promise<unknown>>;

async function readTimelockEntry(
  contract: ViewMethods,
  views: TimelockViews,
): Promise<Pick<TimelockEntry, "pendingAddress" | "executableAt">> {
  const pendingFn = contract[views.pending];
  if (!pendingFn) throw new Error(`missing view ${views.pending}`);
  const pending = (await pendingFn()) as string;
  const zero = /^0x0+$/i.test(pending);
  let executableAt: string | null = null;
  if (!zero && views.executableAt !== undefined) {
    const atFn = contract[views.executableAt];
    if (!atFn) throw new Error(`missing view ${views.executableAt}`);
    const at = (await atFn()) as bigint;
    executableAt = at === 0n ? null : at.toString();
  }
  return { pendingAddress: zero ? null : pending, executableAt };
}

/** One rotation slot: { key, pendingAddress, executableAt, status, executableIn }. */
export function toTimelockEntry(
  key: string,
  contract: string,
  read: Pick<TimelockEntry, "pendingAddress" | "executableAt">,
  nowSec: number,
): TimelockEntry {
  const pending = read.pendingAddress !== null;
  const at = read.executableAt !== null ? BigInt(read.executableAt) : null;
  return {
    key,
    contract,
    currentAddress: null,
    pendingAddress: read.pendingAddress,
    executableAt: read.executableAt,
    status: pending ? "pending" : "idle",
    executableIn: at !== null ? Math.max(0, Number(at) - nowSec) : null,
  };
}

/**
 * GET /v1/governance/timelock — live values of every pending rotation view
 * (verifier / tee-signer / protocol-treasury) + derived status per entry.
 * Ledger M12: these views were previously readable nowhere in prod, so a
 * pending 1-day rotation was invisible until a rotation tx hit DelayNotElapsed.
 */
export function registerGovernanceRoutes(
  app: Express,
  config: ServerConfig,
  provider: ethers.JsonRpcProvider | ethers.FallbackProvider,
): void {
  const cache = new TTLCache<TimelockResponse>(30_000);

  createRoute(
    app,
    routeMeta(
      "/v1/governance/timelock",
      "governance",
      "Live values of every pending rotation timelock view (verifier / tee signer / treasury) with derived status",
      { method: "get" },
    ),
    async (_parsed: unknown, _req, res) => {
      res.setHeader("Cache-Control", "public, max-age=30");
      const cached = cache.get("timelock");
      if (cached) {
        res.json(cached);
        return;
      }
      const addresses = config.addresses;
      const entries: TimelockEntry[] = [];

      const slots: {
        key: string;
        contractName: string;
        address: `0x${string}` | undefined;
        abi: readonly string[];
        views: TimelockViews;
      }[] = [
        {
          key: "verifier",
          contractName: "AxiomAgentNFT",
          address: addresses?.agentNft,
          abi: AGENT_NFT_ABI,
          views: {
            pending: "pendingVerifier",
            executableAt: "pendingVerifierExecutableAt",
          },
        },
        {
          key: "teeSigner",
          contractName: "AxiomTeeVerifier",
          address: addresses?.verifier,
          abi: TEE_VERIFIER_ABI,
          // No pendingSignerExecutableAt view exists (proposedAt is private;
          // only the SignerProposed event carries executableAt) — null.
          views: { pending: "pendingSigner" },
        },
        {
          key: "protocolTreasury",
          contractName: "AxiomPaymentProcessor",
          address: addresses?.paymentProcessor,
          abi: PAYMENT_PROCESSOR_ABI,
          views: {
            pending: "pendingProtocolTreasury",
            executableAt: "pendingTreasuryEffectiveAt",
          },
        },
      ];

      const nowSec = Math.floor(Date.now() / 1000);
      for (const slot of slots) {
        if (!slot.address) continue;
        try {
          const tc = new TypedContract<Record<string, never>>(
            slot.address,
            slot.abi,
            provider,
          );
          const contract = tc.contract as unknown as ViewMethods;
          const read = await readTimelockEntry(contract, slot.views);
          entries.push(
            toTimelockEntry(slot.key, slot.contractName, read, nowSec),
          );
        } catch (err) {
          log.warn("timelock read failed for slot", {
            key: slot.key,
            error: extractErrorMessage(err),
          });
          entries.push({
            key: slot.key,
            contract: slot.contractName,
            currentAddress: null,
            pendingAddress: null,
            executableAt: null,
            status: "idle",
            executableIn: null,
          });
        }
      }
      const result: TimelockResponse = { entries, asOfBlock: null };
      cache.set("timelock", result);
      res.json(result);
    },
    config,
  );
}
