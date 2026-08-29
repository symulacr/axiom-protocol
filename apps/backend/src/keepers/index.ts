import { Wallet } from "ethers";
import { TEE_VERIFIER_ABI } from "@axiom/config/abis";
import { TypedContract } from "@axiom/config/types/contract";
import { canonicalNonceHex } from "@axiom/config/eip712";
import type { BackendEnv } from "../env-schema.js";
import { getSharedProvider } from "../providers.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("keeper");

/** Sweeper methods on AxiomTeeVerifier (cleanExpiredProofs is permissionless — BaseVerifier.sol:30). */
export interface VerifierSweeperMethods {
  cleanExpiredProofs(proofNonces: string[]): Promise<unknown>;
}

export interface SweeperContract {
  contract: VerifierSweeperMethods;
}

/** Gelato Relay entry point: the relay task targets this with candidate nonces (ADR-003 Option B). */
export type RelayCallHandler = (
  candidateNonces: string[],
) => Promise<{ performed: boolean; batch: number }>;

/** Chainlink Automation entry point: the registered upkeep targets this (ADR-003 Option A). */
export type UpkeepHandler = (
  candidateNonces: string[],
) => Promise<{ performed: boolean; batch: number }>;

export interface KeeperHandle {
  stop: () => void;
  /** One sweep, exposed for tests/ops; never throws — a failed sweep resolves 0. */
  sweepOnce: () => Promise<number>;
  /** chainlink mode only: entry point the registered upkeep targets (ADR-003 Option A). */
  upkeepHandler?: UpkeepHandler;
  /** gelato mode only: entry point the relay task targets (ADR-003 Option B). */
  relayCallHandler?: RelayCallHandler;
}

export type KeeperMode = "chainlink" | "gelato" | "indexer" | "off";

interface KeeperDeps {
  env: BackendEnv;
  /** Test seam: override the provider/signer/contract construction. */
  provider?: import("ethers").JsonRpcProvider;
  signer?: Wallet;
  verifier?: SweeperContract;
}

/** Contract-side batch ceiling — BaseVerifier.sol:24 require()s proofNonces.length <= batchMax (256). */
const CONTRACT_BATCH_MAX = 256;

const MODE_PREREQS: Record<Exclude<KeeperMode, "indexer" | "off">, string> = {
  chainlink:
    "a registered time-based upkeep (docs.chain.link Job Scheduler) funded with LINK; ADR-003 Option A cost model: gasPrice×gasUsed×(1+premium)+overhead×gasPrice (~0.008 LINK/day Polygon example, Base premium lower)",
  gelato:
    "a Gelato Relay task (callWithSyncFee) with the fee collector allowlisted on the verifier AND a contract fee-funding path that does not exist yet (ADR-003 Option B, product decision required)",
};

/**
 * Operator-supplied candidate nonces. The on-chain `usedProofs` mapping is
 * `internal` (BaseVerifier.sol:14), no ProofUsed event exists, and transfer
 * route responses are not persisted — so without a contract change (ADR-003:
 * none required) the candidate set comes from the operator, collected the same
 * way the e2e cleaner derives nonces (e2e/steps.ts computeTransferProofNonce).
 */
export function parseKeeperNonces(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => canonicalNonceHex(n));
}

/** Current gas price in gwei, or null when the RPC cannot answer (treated as within cap). */
async function gasPriceGwei(
  provider:
    import("ethers").JsonRpcProvider | import("ethers").FallbackProvider,
): Promise<number | null> {
  try {
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice;
    if (gasPrice === null || gasPrice === undefined) return null;
    return Number(gasPrice) / 1e9;
  } catch {
    return null;
  }
}

export function startKeeper(deps: KeeperDeps): KeeperHandle | null {
  const mode = (deps.env.AXIOM_KEEPER_MODE ?? "off") as KeeperMode;
  if (mode === "off") return null;

  const verifierAddress = deps.env.AXIOM_TEE_VERIFIER_ADDRESS;
  if (!verifierAddress) {
    log.warn(
      "keeper mode enabled but AXIOM_TEE_VERIFIER_ADDRESS is unset — not starting",
    );
    return null;
  }

  const provider = deps.provider ?? getSharedProvider();
  const signer =
    deps.signer ??
    new Wallet(
      process.env.AXIOM_RUNTIME_SIGNER_PK ?? process.env.DEPLOYER_PK ?? "",
      provider,
    );

  const intervalMs = deps.env.AXIOM_KEEPER_INTERVAL_MS ?? 86_400_000;
  const gasCapGwei = deps.env.AXIOM_KEEPER_GAS_CAP_GWEI;
  const batchMax = Math.min(
    deps.env.AXIOM_KEEPER_BATCH_MAX ?? CONTRACT_BATCH_MAX,
    CONTRACT_BATCH_MAX,
  );

  const verifier =
    deps.verifier ??
    new TypedContract<VerifierSweeperMethods>(
      verifierAddress,
      TEE_VERIFIER_ABI,
      signer,
    );

  async function sweepOnce(): Promise<number> {
    const candidates = parseKeeperNonces(deps.env.AXIOM_KEEPER_NONCES).slice(
      0,
      batchMax,
    );
    if (candidates.length === 0) {
      log.info(
        "sweep skipped: no candidate nonces configured (AXIOM_KEEPER_NONCES empty)",
      );
      return 0;
    }
    if (gasCapGwei !== undefined) {
      const gwei = await gasPriceGwei(provider);
      if (gwei !== null && gwei > gasCapGwei) {
        log.warn("sweep skipped: gas price above cap", {
          gasPriceGwei: gwei.toFixed(2),
          capGwei: gasCapGwei,
        });
        return 0;
      }
    }
    // Error tolerance: one failed sweep must not kill the interval — the
    // periodic callback relies on sweepOnce never throwing.
    try {
      await verifier.contract.cleanExpiredProofs(candidates);
    } catch (err) {
      log.error("sweep failed — interval continues", {
        error: err instanceof Error ? err.message : String(err),
      });
      return 0;
    }
    log.info("sweep sent", { nonces: candidates.length, mode });
    return candidates.length;
  }

  if (mode !== "indexer") {
    // STUBS by design (ADR-003 options A/B): the automation platform, not this
    // process, triggers cleanup. These expose the exact entry points a
    // Chainlink custom-logic upkeep or a Gelato relay task would target.
    // No interval runs and nothing is faked.
    const prereq = MODE_PREREQS[mode];
    console.log(
      `[boot] keeper mode ${mode} requires ${prereq} — running in passive mode`,
    );

    const handler: UpkeepHandler = async (candidateNonces) => {
      const batch = candidateNonces.slice(0, batchMax);
      await verifier.contract.cleanExpiredProofs(batch);
      return { performed: true, batch: batch.length };
    };

    return mode === "chainlink"
      ? { stop: () => {}, sweepOnce, upkeepHandler: handler }
      : { stop: () => {}, sweepOnce, relayCallHandler: handler };
  }

  // Indexer mode: the backend wallet sweeps directly on the interval (ADR-003
  // Option C made operational). sweepOnce never throws, so one failed sweep
  // cannot kill the interval.
  const timer = setInterval(() => {
    void sweepOnce();
  }, intervalMs);
  // Never hold the process open for the keeper alone.
  timer.unref();

  log.info("keeper started (indexer mode)", {
    intervalMs,
    batchMax,
    ...(gasCapGwei !== undefined ? { gasCapGwei } : {}),
  });

  return { stop: () => clearInterval(timer), sweepOnce };
}
