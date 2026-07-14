import type { JsonRpcProvider } from "ethers";
import { EVENT_NAMES } from "@axiom/config";
import {
  ADDRESSES,
  type AxiomEvent,
  type IndexerContractAddresses,
} from "./events.js";
import { decodeAxiomLog, type WatchedEvent } from "./events/parser.js";
import { pollOnce, logsByChainOrder } from "./watcher/poll.js";
import { loadCheckpoint, saveCheckpoint } from "./watcher/checkpoint.js";

export const POLL_WINDOW_BLOCKS = 50n;

export const POLL_INTERVAL_MS = 12_000;

export const REORG_SAFE_DEPTH = 10n;

const wait = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function buildDefaultWatchList(
  addresses: IndexerContractAddresses = ADDRESSES,
): readonly WatchedEvent[] {
  return [
  { name: EVENT_NAMES.Transfer, address: addresses.AXIOM_AGENT_NFT },
  { name: "Updated", address: addresses.AXIOM_AGENT_NFT },
  { name: "Authorization", address: addresses.AXIOM_AGENT_NFT },
  { name: "AuthorizationRevoked", address: addresses.AXIOM_AGENT_NFT },
  { name: "VerifierUpdated", address: addresses.AXIOM_AGENT_NFT },
  { name: "CreatorSet", address: addresses.AXIOM_AGENT_NFT },
  { name: "MintFeeUpdated", address: addresses.AXIOM_AGENT_NFT },
  { name: "StorageInfoUpdated", address: addresses.AXIOM_AGENT_NFT },
  { name: "PublishedSealedKey", address: addresses.AXIOM_AGENT_NFT },
  { name: "DelegateAccess", address: addresses.AXIOM_AGENT_NFT },
  { name: EVENT_NAMES.Deposited, address: addresses.AXIOM_STRATEGY_VAULT },
  { name: EVENT_NAMES.Withdrawn, address: addresses.AXIOM_STRATEGY_VAULT },
  { name: EVENT_NAMES.StrategySet, address: addresses.AXIOM_STRATEGY_VAULT },
  { name: EVENT_NAMES.Executed, address: addresses.AXIOM_STRATEGY_VAULT },
  { name: "PaymentProcessed", address: addresses.AXIOM_PAYMENT_PROCESSOR },
  { name: "ComputeProviderPaid", address: addresses.AXIOM_PAYMENT_PROCESSOR },
  { name: "EarningsWithdrawn", address: addresses.AXIOM_PAYMENT_PROCESSOR },
  { name: "RoyaltySet", address: addresses.AXIOM_PAYMENT_PROCESSOR },
  {
    name: "ProtocolTreasuryProposed",
    address: addresses.AXIOM_PAYMENT_PROCESSOR,
  },
  {
    name: "ProtocolTreasuryUpdated",
    address: addresses.AXIOM_PAYMENT_PROCESSOR,
  },
  {
    name: "ProtocolTreasuryProposalCancelled",
    address: addresses.AXIOM_PAYMENT_PROCESSOR,
  },
  { name: "ProtocolFeeBpsUpdated", address: addresses.AXIOM_PAYMENT_PROCESSOR },
  { name: "PaymentTokenUpdated", address: addresses.AXIOM_PAYMENT_PROCESSOR },
  {
    name: "MetadataJsonDecisionDocumented",
    address: addresses.AXIOM_AGENT_NFT,
  },
  { name: "Cloned", address: addresses.AXIOM_AGENT_NFT },
  { name: "SignerProposed", address: addresses.AXIOM_TEE_VERIFIER },
  { name: "SignerExecuted", address: addresses.AXIOM_TEE_VERIFIER },
  { name: "SignerProposalCancelled", address: addresses.AXIOM_TEE_VERIFIER },
  { name: "Upgraded", address: addresses.AXIOM_AGENT_NFT },
  { name: "AdminChanged", address: addresses.AXIOM_AGENT_NFT },
  { name: "BeaconUpgraded", address: addresses.AXIOM_AGENT_NFT },
  { name: "Initialized", address: addresses.AXIOM_AGENT_NFT },
];
}

export const DEFAULT_WATCH_LIST = buildDefaultWatchList();

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
    this.watchList = opts.watchList ?? DEFAULT_WATCH_LIST;
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
      for (const log of logs) {
        try {
          const ev = decodeAxiomLog(log);
          if (ev === null) continue;
          await this.sink(ev);
        } catch (err) {
          this.logger({
            level: "error",
            msg: "skipping bad log",
            blockNumber: log.blockNumber?.toString(),
            transactionHash: log.transactionHash,
            logIndex: log.index,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
      const safeBlock = toBlock > REORG_SAFE_DEPTH ? toBlock - REORG_SAFE_DEPTH : 0n;
      this.nextBlock = toBlock + 1n;
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
