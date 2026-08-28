import type { ethers } from "ethers";
import type { JsonRpcProvider, Log } from "ethers";
import { writeFileAtomic, joinPath } from "@axiom/config/path";
import { getRuntimeConfig } from "@axiom/config/constants";
import { getEnv } from "@axiom/config/env";
import { getEventStore } from "../events/store.js";
import { RUNTIME_DEFAULTS } from "@axiom/config/constants";
import {
  resolveIndexerAddresses,
  type AxiomEvent,
  type EventName,
  type IndexerContractAddresses,
} from "./events.js";
import {
  TOPIC_TABLE,
  decodeAxiomLog,
  type WatchedEvent,
} from "./events/parser.js";
import { extractErrorMessage } from "../utils/response.js";

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

function getCheckpointFile(chainId: bigint): string {
  const dataDir = getEnv("AXIOM_DATA_DIR") || "data";
  const checkpointDir = joinPath(dataDir, "checkpoints");
  return joinPath(checkpointDir, `checkpoint-${chainId}.json`);
}
async function loadCheckpoint(chainId: bigint): Promise<number | null> {
  const checkpointFile = getCheckpointFile(chainId);
  try {
    const data = await Bun.file(checkpointFile).text();
    const parsed = JSON.parse(data);
    // Number.isInteger already excludes non-numbers (and NaN/Infinity).
    if (Number.isInteger(parsed.nextBlock) && parsed.nextBlock > 0) {
      return parsed.nextBlock;
    }
  } catch (err) {
    console.warn("[watcher] failed to load checkpoint:", err);
  }
  return null;
}
async function saveCheckpoint(
  chainId: bigint,
  nextBlock: number,
): Promise<void> {
  const checkpointFile = getCheckpointFile(chainId);
  try {
    // writeFileAtomic keeps the tmp+rename ordering — the checkpoint is never half-written.
    await writeFileAtomic(
      checkpointFile,
      JSON.stringify({ nextBlock, updatedAt: Date.now() }),
    );
  } catch (err) {
    console.error("[watcher] failed to save checkpoint:", err);
  }
}

async function pollOnce(
  provider: JsonRpcProvider,
  watchList: readonly WatchedEvent[],
  fromBlock: bigint,
  window: bigint,
) {
  const toBlock = fromBlock + window - 1n;
  const allLogs: Log[] = [];
  // Group by contract address for multi-topic batching (4 calls vs 31)
  for (const [addr, group] of Map.groupBy(watchList, (w) =>
    w.address.toLowerCase(),
  )) {
    const topics = group.map(({ name }) => TOPIC_TABLE[name]);
    allLogs.push(
      ...(await provider.getLogs({
        address: addr,
        topics: [topics],
        fromBlock,
        toBlock,
      })),
    );
  }
  return allLogs;
}
const logsByChainOrder = (a: Log, b: Log) =>
  a.blockNumber - b.blockNumber || a.index - b.index;

const runtimeConfig = getRuntimeConfig();

const POLL_WINDOW_BLOCKS = BigInt(runtimeConfig.indexerPollWindowBlocks);

const POLL_INTERVAL_MS = runtimeConfig.indexerPollIntervalMs;

const REORG_SAFE_DEPTH = runtimeConfig.indexerReorgSafeDepth;

const wait = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** [event name, contract address key] pairs grouped per contract; order is irrelevant since pollOnce batches by address. */
function watchGroup<K extends keyof IndexerContractAddresses>(
  addrKey: K,
  names: readonly EventName[],
): ReadonlyArray<readonly [EventName, K]> {
  return names.map((name) => [name, addrKey] as const);
}

const DEFAULT_WATCH: ReadonlyArray<
  readonly [name: EventName, addrKey: keyof IndexerContractAddresses]
> = [
  ...watchGroup("AXIOM_AGENT_NFT", [
    "Transfer",
    "Updated",
    "Authorization",
    "AuthorizationRevoked",
    "VerifierUpdated",
    "CreatorSet",
    "MintFeeUpdated",
    "StorageInfoUpdated",
    "PublishedSealedKey",
    "DelegateAccess",
  ]),
  ...watchGroup("AXIOM_STRATEGY_VAULT", [
    "Deposited",
    "Withdrawn",
    "StrategySet",
    "Executed",
  ]),
  ...watchGroup("AXIOM_PAYMENT_PROCESSOR", [
    "PaymentProcessed",
    "ComputeProviderPaid",
    "EarningsWithdrawn",
    "RoyaltySet",
    "ProtocolTreasuryProposed",
    "ProtocolTreasuryUpdated",
    "ProtocolTreasuryProposalCancelled",
    "ProtocolFeeBpsUpdated",
    "PaymentTokenUpdated",
  ]),
  ...watchGroup("AXIOM_TEE_VERIFIER", [
    "SignerProposed",
    "SignerExecuted",
    "SignerProposalCancelled",
  ]),
  ...watchGroup("AXIOM_AGENT_NFT", [
    "MetadataJsonDecisionDocumented",
    "Cloned",
    "Upgraded",
    "AdminChanged",
    "BeaconUpgraded",
    "Initialized",
    // OZ Pausable emits these from NFT, Vault AND PaymentProcessor; the
    // indexer batches per-address, so watching them on every Pausable
    // contract guarantees no pause event is missed.
  ]),
  ...watchGroup("AXIOM_STRATEGY_VAULT", ["Paused", "Unpaused"]),
  ...watchGroup("AXIOM_PAYMENT_PROCESSOR", ["Paused", "Unpaused"]),
];

export function buildDefaultWatchList(
  addresses?: IndexerContractAddresses,
): readonly WatchedEvent[] {
  const resolved = addresses ?? resolveIndexerAddresses();
  return DEFAULT_WATCH.map(([name, addrKey]) => ({
    name,
    address: resolved[addrKey],
  }));
}

type EventSink = (event: AxiomEvent) => void | Promise<void>;

type WatcherOptions = {
  provider: JsonRpcProvider;
  watchList?: readonly WatchedEvent[];
  pollWindow?: bigint;
  pollIntervalMs?: number;
  sink: EventSink;
  startBlock?: bigint;
  logger?: (line: Record<string, unknown>) => void;
  onReorg?: (rolledBackBlock: bigint) => void;
  /** Durability hook: runs before the checkpoint advances so the sink's
   * buffered state is persisted first (crash window closed). A throw here
   * blocks checkpoint advance and retries the window. */
  beforeCheckpoint?: () => Promise<void>;
};

export class Watcher {
  readonly provider: JsonRpcProvider;
  readonly watchList: readonly WatchedEvent[];
  readonly window: bigint;
  readonly intervalMs: number;
  readonly sink: EventSink;
  readonly logger: (line: Record<string, unknown>) => void;
  private readonly onReorg: ((rolledBackBlock: bigint) => void) | null;
  private readonly beforeCheckpoint: (() => Promise<void>) | null;
  private nextBlock: bigint;
  private lastBlockHash: string | null = null;
  private running = false;
  private chainId: bigint | null = null;
  private consecutiveFailures = 0;
  private maxConsecutiveFailures = 10;
  /** Dead-lettered logs (keyed txHash:logIndex) that failed to decode — never re-attempted on rescan. */
  private readonly skippedLogs = new Set<string>();

  constructor(opts: WatcherOptions) {
    this.provider = opts.provider;
    this.watchList = opts.watchList ?? buildDefaultWatchList();
    this.window = opts.pollWindow ?? POLL_WINDOW_BLOCKS;
    this.intervalMs = opts.pollIntervalMs ?? POLL_INTERVAL_MS;
    this.sink = opts.sink;
    this.logger =
      opts.logger ??
      ((line) => console.error(JSON.stringify({ level: "info", ...line })));
    this.nextBlock = opts.startBlock ?? 0n;
    this.onReorg = opts.onReorg ?? null;
    this.beforeCheckpoint = opts.beforeCheckpoint ?? null;
  }

  get cursor(): bigint {
    return this.nextBlock;
  }

  private async resolveChainId(): Promise<bigint> {
    if (this.chainId !== null) return this.chainId;
    const network = await this.provider.getNetwork();
    this.chainId = network.chainId;
    return this.chainId;
  }

  private async pollTick(): Promise<void> {
    if (!this.running) return;
    try {
      const id = await this.resolveChainId();
      const head = await this.provider.getBlockNumber();
      const latest = BigInt(head);

      // Reorg-safe cursor: verify the last processed block hash is still canonical; on mismatch roll back past REORG_SAFE_DEPTH×2 before the diverged block
      if (this.lastBlockHash && this.nextBlock > 1n) {
        const checkBlock = this.nextBlock - 1n;
        try {
          const block = await this.provider.getBlock(Number(checkBlock));
          if (block?.hash && block.hash !== this.lastBlockHash) {
            this.logger({
              level: "warn",
              msg: "reorg detected — block hash mismatch",
              blockNumber: checkBlock.toString(),
              expectedHash: this.lastBlockHash,
              actualHash: block.hash,
            });
            const rollbackTarget =
              checkBlock > REORG_SAFE_DEPTH * 2n
                ? checkBlock - REORG_SAFE_DEPTH * 2n
                : 0n;
            this.nextBlock = rollbackTarget;
            this.lastBlockHash = null;
            this.onReorg?.(checkBlock);
          }
        } catch {
          /* block may not exist yet — skip hash check */
        }
      }

      if (this.nextBlock === 0n) {
        this.nextBlock = latest >= this.window ? latest - this.window : 0n;
      }

      // bigint clamp — Math.min() throws on BigInt, ternary is the only option
      const fromBlock = this.nextBlock < latest ? this.nextBlock : latest;

      const windowEnd = fromBlock + this.window - 1n;
      const toBlock = windowEnd > latest ? latest : windowEnd;

      if (toBlock < fromBlock) {
        this.logger({
          msg: "poll tick skipped",
          reason: "head not advanced",
          latest: latest.toString(),
          cursor: this.nextBlock.toString(),
        });
        return;
      }

      const range = toBlock - fromBlock + 1n;
      const logs = await pollOnce(
        this.provider,
        this.watchList,
        fromBlock,
        range,
      );
      logs.sort(logsByChainOrder);
      let sinkFailures = 0;
      let lastSinkError: unknown;
      for (const log of logs) {
        const logKey = `${log.transactionHash}:${log.index}`;
        if (this.skippedLogs.has(logKey)) continue;
        let ev: AxiomEvent | null;
        try {
          ev = decodeAxiomLog(log);
        } catch (err) {
          // Dead-letter malformed logs: one undecodable event must never wedge the scan.
          // Strict decoding stays in place for parseable data — only genuine decode
          // failures are skipped, and the window still advances.
          this.skippedLogs.add(logKey);
          this.logger({
            level: "error",
            msg: "skipping malformed log — decode failed; dead-lettered",
            blockNumber: log.blockNumber?.toString(),
            topic0: log.topics[0],
            address: log.address,
            transactionHash: log.transactionHash,
            logIndex: log.index,
            err: extractErrorMessage(err),
          });
          continue;
        }
        if (ev === null) continue;
        try {
          await this.sink(ev);
        } catch (err) {
          sinkFailures += 1;
          lastSinkError = err;
          this.logger({
            level: "error",
            msg: "sink delivery failed — not advancing checkpoint past this window",
            blockNumber: log.blockNumber?.toString(),
            transactionHash: log.transactionHash,
            logIndex: log.index,
            err: extractErrorMessage(err),
          });
        }
      }
      if (sinkFailures > 0) {
        // Do not advance nextBlock / checkpoint when any event failed delivery.
        throw lastSinkError instanceof Error
          ? lastSinkError
          : new Error(
              `sink failed for ${sinkFailures} log(s) in window ${fromBlock}-${toBlock}`,
            );
      }
      // Flush the sink's buffered state BEFORE advancing the cursor: the
      // EventStore debounces disk writes, so a crash between append and
      // persist would otherwise skip those blocks forever. A throw here
      // keeps the cursor (and checkpoint) on the old window for a full rescan.
      await this.beforeCheckpoint?.();
      const safeBlock =
        toBlock > REORG_SAFE_DEPTH ? toBlock - REORG_SAFE_DEPTH : 0n;
      this.nextBlock = safeBlock + 1n;
      // The hash must belong to the block the cursor points at (nextBlock-1 =
      // safeBlock) — storing the head-side hash made every later poll compare
      // hashes of two DIFFERENT blocks and fire a false reorg every tick.
      try {
        const lastBlock = await this.provider.getBlock(Number(safeBlock));
        this.lastBlockHash = lastBlock?.hash ?? null;
      } catch {
        this.lastBlockHash = null;
      }
      await saveCheckpoint(id, Number(this.nextBlock));
      this.consecutiveFailures = 0;
      this.logger({
        msg: "poll tick",
        fromBlock: fromBlock.toString(),
        toBlock: toBlock.toString(),
        latest: latest.toString(),
        nextBlock: this.nextBlock.toString(),
        safeBlock: safeBlock.toString(),
        logCount: logs.length,
      });
    } catch (err) {
      this.consecutiveFailures++;
      this.logger({
        level: "error",
        msg: "poll tick failed",
        consecutiveFailures: this.consecutiveFailures,
        maxConsecutiveFailures: this.maxConsecutiveFailures,
        err: extractErrorMessage(err),
      });
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        const cooldown = Math.min(this.intervalMs * 10, 300_000);
        this.logger({
          level: "warn",
          msg: "max consecutive failures reached — cooling down before retry",
          cooldownMs: cooldown,
        });
        this.consecutiveFailures = 5; // partial reset so the next backoff retries sooner than a full reset would
        await wait(cooldown);
        return;
      }
      const backoff = Math.min(
        this.intervalMs * 2 ** this.consecutiveFailures,
        60_000,
      );
      await wait(backoff);
    }
  }

  private async runLoop(resolveStopped: () => void): Promise<void> {
    try {
      const id = await this.resolveChainId();
      const savedBlock = await loadCheckpoint(id);
      if (savedBlock !== null) {
        console.log(`[watcher] resuming from checkpoint block ${savedBlock}`);
        this.nextBlock = BigInt(savedBlock);
      }
    } catch (err) {
      this.logger({
        level: "error",
        msg: "failed to load checkpoint",
        err: extractErrorMessage(err),
      });
    }

    // Sequential poll loop by design: each tick must complete before the next
    // starts (blocks must be contiguous), and wait throttles the cadence.
    while (this.running) {
      await this.pollTick();
      if (!this.running) break;
      await wait(this.intervalMs);
    }
    resolveStopped();
  }

  start() {
    if (this.running) throw new Error("Watcher already running");
    this.running = true;
    const { promise: stopped, resolve: resolveStopped } =
      Promise.withResolvers<void>();
    void this.runLoop(resolveStopped);

    return {
      stop: async (): Promise<void> => {
        this.running = false;
        await stopped;
      },
    };
  }
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
