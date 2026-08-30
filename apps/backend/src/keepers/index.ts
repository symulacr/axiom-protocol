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

/**
 * Log-discovery surface for the ProofUsed event (BaseVerifier._checkAndMarkProof).
 * Wave 1B: every consumed proof nonce is now logged, so sweep candidates are
 * derivable from chain logs instead of a static operator list. Accessed through
 * the untyped ethers Contract (TypedContract.raw) — the event is ABI-known but
 * not part of the sweeper method type.
 */

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
  /** Test seam: override the raw ethers Contract used for ProofUsed log queries. */
  verifierRaw?: import("ethers").Contract;
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
 * Fallback candidate nonces (AXIOM_KEEPER_NONCES). Since Wave 1B the verifier
 * emits `ProofUsed(nonce, timestamp)` on every consumed nonce
 * (BaseVerifier._checkAndMarkProof), so `deriveCandidates` prefers a live log
 * scan (fetchProofUsedNonces) and only uses this static list when the verifier
 * predates the event or the scan fails — e.g. nonces collected the same way
 * the e2e cleaner derives them (e2e/steps.ts computeTransferProofNonce).
 */
export function parseKeeperNonces(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => canonicalNonceHex(n));
}

/**
 * Derive sweep candidates from ProofUsed(nonce, timestamp) logs on the verifier.
 * @param fromBlock first block to scan (use the deployment/lookback start);
 * @param toBlock   last block to scan (defaults to latest via the provider).
 * Returns canonical 0x-padded 32-byte nonce hex, newest-last, deduped.
 * A failed scan resolves [] — the caller falls back to AXIOM_KEEPER_NONCES.
 */
export async function fetchProofUsedNonces(
  raw: import("ethers").Contract,
  fromBlock: number | string | bigint,
  toBlock?: number | string | bigint,
): Promise<string[]> {
  const logs = await raw.queryFilter("ProofUsed", fromBlock, toBlock);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const log of logs) {
    // EventLog (abi-decoded); a plain Log means the ABI lacks the event.
    if (!("args" in log)) continue;
    const nonce = canonicalNonceHex(log.args[0] as string);
    if (!seen.has(nonce)) {
      seen.add(nonce);
      out.push(nonce);
    }
  }
  return out;
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
  // Same address+ABI, untyped view — used only for ProofUsed log discovery.
  // Absent for test-supplied stub verifiers: those exercise the env fallback.
  const verifierRaw: import("ethers").Contract | undefined =
    deps.verifierRaw ??
    (deps.verifier
      ? undefined
      : (verifier as TypedContract<VerifierSweeperMethods>).raw);

  // Lookback window for ProofUsed log scans. Proofs live maxProofAgeSeconds on
  // chain (default 7d), so anything older is unsweepable regardless — the
  // default covers exactly the sweepable window.
  const lookbackBlocks = deps.env.AXIOM_KEEPER_LOG_LOOKBACK_BLOCKS ?? 2_000_000;

  async function deriveCandidates(): Promise<string[]> {
    // Wave 1B: ProofUsed is emitted by BaseVerifier._checkAndMarkProof on every
    // consumed nonce. When the verifier predates the event (or the scan fails),
    // fall back to the operator-supplied AXIOM_KEEPER_NONCES list.
    if (verifierRaw) {
      try {
        const current = await provider.getBlockNumber();
        const fromBlock = Math.max(0, current - lookbackBlocks);
        const candidates = await fetchProofUsedNonces(
          verifierRaw,
          fromBlock,
          current,
        );
        if (candidates.length > 0) {
          log.info("keeper candidates from ProofUsed logs", {
            found: candidates.length,
            fromBlock,
            toBlock: current,
          });
          return candidates;
        }
        log.info(
          "no ProofUsed logs found — falling back to AXIOM_KEEPER_NONCES",
        );
      } catch (err) {
        log.warn("ProofUsed log scan failed — falling back to env config", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return parseKeeperNonces(deps.env.AXIOM_KEEPER_NONCES);
  }

  async function sweepOnce(): Promise<number> {
    const allCandidates = await deriveCandidates();
    const candidates = allCandidates.slice(0, batchMax);
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
