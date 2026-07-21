import type { JsonRpcProvider } from "ethers";
import { EVENT_NAMES } from "@axiom/config";
import {
  resolveIndexerAddresses,
  type AxiomEvent,
  type IndexerContractAddresses,
} from "./events.js";
import { decodeAxiomLog, type WatchedEvent } from "./events/parser.js";
import { pollOnce, logsByChainOrder } from "./watcher/poll.js";
import { loadCheckpoint, saveCheckpoint } from "./watcher/checkpoint.js";

<<<<<<< Updated upstream
=======
import { ADDRESSES, EVENT_ABI, EVENT_SIGNATURES, type AxiomEvent, type EventName } from "./events.js";

/** Block range per eth_getLogs call. */
>>>>>>> Stashed changes
export const POLL_WINDOW_BLOCKS = 50n;

export const POLL_INTERVAL_MS = 12_000;

export const REORG_SAFE_DEPTH = 10n;

/**
 * Next block to poll after processing up through `toBlock`.
 * Stays reorgDepth behind head so shallow reorgs are re-scanned.
 */
<<<<<<< Updated upstream
export function nextCheckpointBlock(
  toBlock: bigint,
  reorgDepth: bigint = REORG_SAFE_DEPTH,
): bigint {
  const safeBlock = toBlock > reorgDepth ? toBlock - reorgDepth : 0n;
  return safeBlock + 1n;
=======

/** Checkpoint file (stores nextBlock cursor). */
const CHECKPOINT_FILE = join(process.cwd(), "data", "checkpoint.json");

/** Topic-0 for every event. */
export type EventTopicTable = { [K in EventName]: Hex };
const TOPIC_TABLE: EventTopicTable = Object.fromEntries(
  Object.entries(EVENT_SIGNATURES).map(([name, sig]) => [
    name,
    validateHex(ethers.id(sig)),
  ]),
) as EventTopicTable;

/** topic-0 hex → event name. */
const TOPIC_TO_EVENT: Record<string, EventName> = {};
for (const name of Object.keys(TOPIC_TABLE) as EventName[]) {
  TOPIC_TO_EVENT[TOPIC_TABLE[name].toLowerCase()] = name;
>>>>>>> Stashed changes
}

const wait = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function buildDefaultWatchList(
  addresses?: IndexerContractAddresses,
): readonly WatchedEvent[] {
  const resolved = addresses ?? resolveIndexerAddresses();
  return [
  { name: EVENT_NAMES.Transfer, address: resolved.AXIOM_AGENT_NFT },
  { name: "Updated", address: resolved.AXIOM_AGENT_NFT },
  { name: "Authorization", address: resolved.AXIOM_AGENT_NFT },
  { name: "AuthorizationRevoked", address: resolved.AXIOM_AGENT_NFT },
  { name: "VerifierUpdated", address: resolved.AXIOM_AGENT_NFT },
  { name: "CreatorSet", address: resolved.AXIOM_AGENT_NFT },
  { name: "MintFeeUpdated", address: resolved.AXIOM_AGENT_NFT },
  { name: "StorageInfoUpdated", address: resolved.AXIOM_AGENT_NFT },
  { name: "PublishedSealedKey", address: resolved.AXIOM_AGENT_NFT },
  { name: "DelegateAccess", address: resolved.AXIOM_AGENT_NFT },
  { name: EVENT_NAMES.Deposited, address: resolved.AXIOM_STRATEGY_VAULT },
  { name: EVENT_NAMES.Withdrawn, address: resolved.AXIOM_STRATEGY_VAULT },
  { name: EVENT_NAMES.StrategySet, address: resolved.AXIOM_STRATEGY_VAULT },
  { name: EVENT_NAMES.Executed, address: resolved.AXIOM_STRATEGY_VAULT },
  { name: "PaymentProcessed", address: resolved.AXIOM_PAYMENT_PROCESSOR },
  { name: "ComputeProviderPaid", address: resolved.AXIOM_PAYMENT_PROCESSOR },
  { name: "EarningsWithdrawn", address: resolved.AXIOM_PAYMENT_PROCESSOR },
  { name: "RoyaltySet", address: resolved.AXIOM_PAYMENT_PROCESSOR },
  {
    name: "ProtocolTreasuryProposed",
    address: resolved.AXIOM_PAYMENT_PROCESSOR,
  },
  {
    name: "ProtocolTreasuryUpdated",
    address: resolved.AXIOM_PAYMENT_PROCESSOR,
  },
  {
    name: "ProtocolTreasuryProposalCancelled",
    address: resolved.AXIOM_PAYMENT_PROCESSOR,
  },
  { name: "ProtocolFeeBpsUpdated", address: resolved.AXIOM_PAYMENT_PROCESSOR },
  { name: "PaymentTokenUpdated", address: resolved.AXIOM_PAYMENT_PROCESSOR },
  {
    name: "MetadataJsonDecisionDocumented",
    address: resolved.AXIOM_AGENT_NFT,
  },
  { name: "Cloned", address: resolved.AXIOM_AGENT_NFT },
  { name: "SignerProposed", address: resolved.AXIOM_TEE_VERIFIER },
  { name: "SignerExecuted", address: resolved.AXIOM_TEE_VERIFIER },
  { name: "SignerProposalCancelled", address: resolved.AXIOM_TEE_VERIFIER },
  { name: "Upgraded", address: resolved.AXIOM_AGENT_NFT },
  { name: "AdminChanged", address: resolved.AXIOM_AGENT_NFT },
  { name: "BeaconUpgraded", address: resolved.AXIOM_AGENT_NFT },
  { name: "Initialized", address: resolved.AXIOM_AGENT_NFT },
];
}

export type EventSink = (event: AxiomEvent) => void | Promise<void>;

export type WatcherOptions = {
  provider: JsonRpcProvider;
  watchList?: readonly WatchedEvent[];
  pollWindow?: bigint;
  pollIntervalMs?: number;
  sink: EventSink;
  startBlock?: bigint;
  logger?: (line: Record<string, unknown>) => void;
};

export class Watcher {
  readonly provider: JsonRpcProvider;
  readonly watchList: readonly WatchedEvent[];
  readonly window: bigint;
  readonly intervalMs: number;
  readonly sink: EventSink;
  readonly logger: (line: Record<string, unknown>) => void;
  private nextBlock: bigint;
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

      if (this.nextBlock === 0n) {
        this.nextBlock = latest >= this.window ? latest - this.window : 0n;
      }

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
      // Only advance past reorg-safe head so a shallow reorg can re-scan.
      const safeBlock =
        toBlock > REORG_SAFE_DEPTH ? toBlock - REORG_SAFE_DEPTH : 0n;
      this.nextBlock = nextCheckpointBlock(toBlock, REORG_SAFE_DEPTH);
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
        this.logger({
          level: "fatal",
          msg: "max consecutive failures reached — stopping",
        });
        this.running = false;
        await wait(this.intervalMs);
        return;
      }
      const backoff = Math.min(
        this.intervalMs * Math.pow(2, this.consecutiveFailures),
        60_000,
      );
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, backoff);
      await promise;
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
