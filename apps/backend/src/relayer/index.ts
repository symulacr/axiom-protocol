import { getRelayerConfig } from "@axiom/config";
import { getQueueStats, type RelayerQueue } from "./queue.js";
import type { ReconcileEngine } from "./reconcile.js";
import type { SponsorGate } from "./sponsor.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("relayer");

export interface RelayerHandle {
  stop: () => void;
}

export interface StartRelayerOptions {
  queue: RelayerQueue;
  gate: SponsorGate;
  reconcile: ReconcileEngine;
}

/**
 * Relayer worker loop: batch-drains the queue on AXIOM_RELAYER_INTERVAL_MS and
 * runs reconciliation on AXIOM_RELAYER_RECONCILE_INTERVAL_MS. Timers are unref'd
 * so a live relayer never keeps the process alive on its own.
 */
export function startRelayer(opts: StartRelayerOptions): RelayerHandle {
  const cfg = getRelayerConfig();

  const tick = async (): Promise<void> => {
    try {
      const stats = getQueueStats(opts.queue);
      if (stats.queued > 0) {
        await opts.reconcile.drainBatch();
      }
    } catch (err) {
      log.warn(
        `relayer tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const reconcileTick = async (): Promise<void> => {
    try {
      await opts.reconcile.reconcile();
    } catch (err) {
      log.warn(
        `reconcile failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const queueTimer = setInterval(() => void tick(), cfg.intervalMs);
  const reconcileTimer = setInterval(
    () => void reconcileTick(),
    cfg.reconcileIntervalMs,
  );
  queueTimer.unref?.();
  reconcileTimer.unref?.();
  log.info(
    `relayer started (interval=${cfg.intervalMs}ms, reconcile=${cfg.reconcileIntervalMs}ms)`,
  );

  return {
    stop: () => {
      clearInterval(queueTimer);
      clearInterval(reconcileTimer);
      log.info("relayer stopped");
    },
  };
}
