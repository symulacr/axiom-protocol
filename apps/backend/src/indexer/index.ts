import type { ethers } from "ethers";
import { getEventStore } from "../events/store.js";
import { RUNTIME_DEFAULTS } from "@axiom/config";
import { Watcher, buildDefaultWatchList } from "./watcher.js";
import { resolveIndexerAddresses } from "./events.js";
import type { AxiomEvent } from "./events.js";

interface IndexerServiceConfig {
  provider: ethers.JsonRpcProvider;
  env: {
    INDEXER_POLL_WINDOW_BLOCKS?: number;
    INDEXER_START_BLOCK?: number;
    AXIOM_INDEXER_API_KEY?: string;
    AXIOM_EVM_RPC: string;
    DEPLOYER_PK?: string;
    AXIOM_CHAIN_ID?: string | number;
    AXIOM_DATA_DIR?: string;
  };
}

export class IndexerService {
  private watcher: Watcher | null = null;
  private stopWatcher: (() => Promise<void>) | null = null;

  constructor(private config: IndexerServiceConfig) {}

  start(): void {
    const { provider, env } = this.config;

    const addresses = resolveIndexerAddresses(env as Record<string, unknown>);
    const watchList = buildDefaultWatchList(addresses);

    const sink = (event: AxiomEvent) => {
      const { kind, blockNumber, txHash, logIndex, ...payload } = event;
      getEventStore().append({
        source: "indexer",
        chainId: Number(env.AXIOM_CHAIN_ID),
        blockNumber,
        txHash: txHash ?? null,
        logIndex,
        eventName: kind,
        payload: payload as Record<string, unknown>,
      });
    };
    this.watcher = new Watcher({
      provider,
      sink,
      watchList,
      pollWindow: BigInt(
        env.INDEXER_POLL_WINDOW_BLOCKS ??
          RUNTIME_DEFAULTS.indexerPollWindowBlocks,
      ),
      ...(env.INDEXER_START_BLOCK !== undefined
        ? { startBlock: BigInt(env.INDEXER_START_BLOCK) }
        : {}),
      onReorg: (rolledBackBlock: bigint) => {
        const removed = getEventStore().rollbackToBlock(rolledBackBlock);
        console.warn(
          `[indexer] reorg rollback: removed ${removed} events at or above block ${rolledBackBlock}`,
        );
      },
      // Crash-window guard: persist buffered events before the checkpoint
      // advances, so a SIGKILL can never skip unpersisted blocks.
      beforeCheckpoint: () => getEventStore().flush(),
    });

    const handle = this.watcher.start();
    this.stopWatcher = handle.stop;
  }

  stop(): void {
    if (this.stopWatcher) {
      this.stopWatcher().catch(() => {});
      this.stopWatcher = null;
    }
    this.watcher = null;
  }
}
