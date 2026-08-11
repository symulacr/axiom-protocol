import type { JsonRpcProvider, Log } from "ethers";
import { rename, mkdir } from "node:fs/promises";
import { joinPath, dirnamePath } from "@axiom/config/path";
import { EVENT_NAMES, getRuntimeConfig } from "@axiom/config";
import { getEnv } from "@axiom/config/env";
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
    if (
      typeof parsed.nextBlock === "number" &&
      Number.isInteger(parsed.nextBlock) &&
      parsed.nextBlock > 0
    ) {
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
  const tmp = checkpointFile + ".tmp";
  try {
    await mkdir(dirnamePath(checkpointFile), { recursive: true });
    // Bun.write for speed; tmp+rename keeps the checkpoint write atomic; dir ops stay node:fs/promises (Bun routes those there)
    await Bun.write(tmp, JSON.stringify({ nextBlock, updatedAt: Date.now() }));
    await rename(tmp, checkpointFile);
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
  const byAddress = new Map<string, string[]>();
  for (const { name, address } of watchList) {
    const key = address.toLowerCase();
    const list = byAddress.get(key);
    if (list) {
      list.push(TOPIC_TABLE[name]);
    } else {
      byAddress.set(key, [TOPIC_TABLE[name]]);
    }
  }
  for (const [addr, topics] of byAddress) {
    const filter = { address: addr, topics: [topics], fromBlock, toBlock };
    const logs = await provider.getLogs(filter);
    for (const log of logs) allLogs.push(log);
  }
  return allLogs;
}
function logsByChainOrder(a: Log, b: Log) {
  if (a.blockNumber !== b.blockNumber) {
    return a.blockNumber < b.blockNumber ? -1 : 1;
  }
  if (a.index !== b.index) {
    return a.index < b.index ? -1 : 1;
  }
  return 0;
}

const runtimeConfig = getRuntimeConfig();

const POLL_WINDOW_BLOCKS = BigInt(runtimeConfig.indexerPollWindowBlocks);

const POLL_INTERVAL_MS = runtimeConfig.indexerPollIntervalMs;

const REORG_SAFE_DEPTH = runtimeConfig.indexerReorgSafeDepth;

const wait = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const DEFAULT_WATCH: ReadonlyArray<
  readonly [name: EventName, addrKey: keyof IndexerContractAddresses]
> = [
  [EVENT_NAMES.Transfer, "AXIOM_AGENT_NFT"],
  ["Updated", "AXIOM_AGENT_NFT"],
  ["Authorization", "AXIOM_AGENT_NFT"],
  ["AuthorizationRevoked", "AXIOM_AGENT_NFT"],
  ["VerifierUpdated", "AXIOM_AGENT_NFT"],
  ["CreatorSet", "AXIOM_AGENT_NFT"],
  ["MintFeeUpdated", "AXIOM_AGENT_NFT"],
  ["StorageInfoUpdated", "AXIOM_AGENT_NFT"],
  ["PublishedSealedKey", "AXIOM_AGENT_NFT"],
  ["DelegateAccess", "AXIOM_AGENT_NFT"],
  [EVENT_NAMES.Deposited, "AXIOM_STRATEGY_VAULT"],
  [EVENT_NAMES.Withdrawn, "AXIOM_STRATEGY_VAULT"],
  [EVENT_NAMES.StrategySet, "AXIOM_STRATEGY_VAULT"],
  [EVENT_NAMES.Executed, "AXIOM_STRATEGY_VAULT"],
  ["PaymentProcessed", "AXIOM_PAYMENT_PROCESSOR"],
  ["ComputeProviderPaid", "AXIOM_PAYMENT_PROCESSOR"],
  ["EarningsWithdrawn", "AXIOM_PAYMENT_PROCESSOR"],
  ["RoyaltySet", "AXIOM_PAYMENT_PROCESSOR"],
  ["ProtocolTreasuryProposed", "AXIOM_PAYMENT_PROCESSOR"],
  ["ProtocolTreasuryUpdated", "AXIOM_PAYMENT_PROCESSOR"],
  ["ProtocolTreasuryProposalCancelled", "AXIOM_PAYMENT_PROCESSOR"],
  ["ProtocolFeeBpsUpdated", "AXIOM_PAYMENT_PROCESSOR"],
  ["PaymentTokenUpdated", "AXIOM_PAYMENT_PROCESSOR"],
  ["MetadataJsonDecisionDocumented", "AXIOM_AGENT_NFT"],
  ["Cloned", "AXIOM_AGENT_NFT"],
  ["SignerProposed", "AXIOM_TEE_VERIFIER"],
  ["SignerExecuted", "AXIOM_TEE_VERIFIER"],
  ["SignerProposalCancelled", "AXIOM_TEE_VERIFIER"],
  ["Upgraded", "AXIOM_AGENT_NFT"],
  ["AdminChanged", "AXIOM_AGENT_NFT"],
  ["BeaconUpgraded", "AXIOM_AGENT_NFT"],
  ["Initialized", "AXIOM_AGENT_NFT"],
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
};

export class Watcher {
  readonly provider: JsonRpcProvider;
  readonly watchList: readonly WatchedEvent[];
  readonly window: bigint;
  readonly intervalMs: number;
  readonly sink: EventSink;
  readonly logger: (line: Record<string, unknown>) => void;
  private readonly onReorg: ((rolledBackBlock: bigint) => void) | null;
  private nextBlock: bigint;
  private lastBlockHash: string | null = null;
  private running = false;
  private chainId: bigint | null = null;
  private consecutiveFailures = 0;
  private maxConsecutiveFailures = 10;

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
        try {
          const ev = decodeAxiomLog(log);
          if (ev === null) continue;
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
            err: err instanceof Error ? err.message : String(err),
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
      const safeBlock =
        toBlock > REORG_SAFE_DEPTH ? toBlock - REORG_SAFE_DEPTH : 0n;
      this.nextBlock = safeBlock + 1n;
      try {
        const lastBlock = await this.provider.getBlock(Number(toBlock));
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
        err: err instanceof Error ? err.message : String(err),
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
        err: err instanceof Error ? err.message : String(err),
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
