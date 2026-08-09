import type { ethers } from "ethers";
import { getEventStore } from "../events/store.js";
import { RUNTIME_DEFAULTS } from "@axiom/config";
import { Watcher, buildDefaultWatchList } from "./watcher.js";
import { resolveIndexerAddresses } from "./events.js";
import type { AxiomEvent } from "./events.js";

export interface IndexerServiceConfig {
  provider: ethers.JsonRpcProvider;
  env: {
    AXIOM_STORAGE_RPC?: string;
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
  private startedAt = 0;
  private lastProcessedBlock = 0;

  constructor(private config: IndexerServiceConfig) {}

  start(): void {
    const { provider, env } = this.config;

    const addresses = resolveIndexerAddresses(env as Record<string, unknown>);
    const watchList = buildDefaultWatchList(addresses);

    const sink = (event: AxiomEvent) => {
      const { kind, blockNumber, txHash, logIndex, ...payload } = event;
      getEventStore().append({
        source: "indexer",
        chainId: Number(env.AXIOM_CHAIN_ID ?? 16661),
        blockNumber,
        txHash: txHash ?? null,
        logIndex,
        eventName: kind,
        payload: payload as Record<string, unknown>,
      });
      this.lastProcessedBlock = Math.max(this.lastProcessedBlock, blockNumber);
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
    });

    this.startedAt = Date.now();
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

  getStatus(): { lastProcessedBlock: number; uptime: number } {
    return {
      lastProcessedBlock: this.lastProcessedBlock,
      uptime: this.startedAt ? Date.now() - this.startedAt : 0,
    };
  }
}
