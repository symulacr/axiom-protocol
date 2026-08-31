import type { ethers } from "ethers";
import { GAS_TANK_ABI } from "@axiom/config/abis";
import { getRelayerConfig } from "@axiom/config";
import { TypedContract } from "@axiom/config/types/contract";
import type { RelayerQueue, SponsorRecord, RelaySubmitter } from "./queue.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("relayer.reconcile");

type GasTankLogs = {
  // Lane A delta: Relayed(address indexed user, address indexed relayer,
  // address indexed target, bool success, uint256 measured, uint256 reimburse,
  // uint256 nonce) — nonce is the trailing UNINDEXED arg, not the first indexed one.
  queryFilter(
    event: "Relayed",
    fromBlock: number,
    toBlock: number,
  ): Promise<
    Array<{
      args: {
        user?: string;
        relayer?: string;
        target?: string;
        success?: boolean;
        measured?: bigint;
        reimburse?: bigint;
        nonce?: bigint;
      };
    }>
  >;
};

/**
 * Reconciliation: Relayed-log scan marks submitted records confirmed
 * (success:false is a normal terminal state — target reverted, relay itself
 * succeeded, plan §7 #7) and a bounded drain loop submits queued records via
 * the injected submitter. Dead-lettering happens in the queue on broadcast failure.
 */
export class ReconcileEngine {
  private gasTank: TypedContract<GasTankLogs> | null;
  private cfg = getRelayerConfig();

  constructor(
    private queue: RelayerQueue,
    gasTankAddress: `0x${string}` | undefined,
    private provider: ethers.JsonRpcProvider | ethers.FallbackProvider,
  ) {
    this.gasTank = gasTankAddress
      ? new TypedContract<GasTankLogs>(gasTankAddress, GAS_TANK_ABI, provider)
      : null;
  }

  /** Scan recent Relayed logs and confirm matching submitted records. */
  async reconcile(): Promise<{ scanned: number; confirmed: number }> {
    if (!this.gasTank) return { scanned: 0, confirmed: 0 };
    const latest = await this.provider.getBlockNumber();
    const fromBlock = Math.max(0, latest - this.cfg.logLookbackBlocks);
    let scanned = 0;
    let confirmed = 0;
    try {
      const logs = await this.gasTank.contract.queryFilter(
        "Relayed",
        fromBlock,
        latest,
      );
      scanned = logs.length;
      const submitted = new Map<string, SponsorRecord>();
      for (const r of this.queue.all()) {
        if (r.status === "submitted") {
          submitted.set(`${r.user}:${r.request.nonce.toString()}`, r);
        }
      }
      for (const entry of logs) {
        const key = `${(entry.args.user ?? "").toLowerCase()}:${entry.args.nonce?.toString()}`;
        const record = submitted.get(key);
        if (record) {
          this.queue.markConfirmed(record.id);
          confirmed += 1;
        }
      }
    } catch (err) {
      // Log scan failure is non-fatal: next pass retries with a wider window.
      log.warn(
        `Relayed log scan failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (confirmed > 0) {
      log.info(`reconcile confirmed ${confirmed}/${scanned} relayed ops`);
    }
    return { scanned, confirmed };
  }

  /** Drain up to AXIOM_RELAYER_BATCH_MAX queued records through the submitter. */
  async drainBatch(submit?: RelaySubmitter): Promise<number> {
    const batch = this.queue.takeBatch(this.cfg.batchMax);
    if (!submit) return 0;
    for (const record of batch) {
      try {
        const txHash = await submit(record);
        record.txHash = txHash;
      } catch (err) {
        this.queue.markFailed(
          record.id,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    return batch.length;
  }
}
