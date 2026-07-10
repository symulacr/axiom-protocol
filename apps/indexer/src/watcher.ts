import type { JsonRpcProvider, Log } from "ethers";
import {
  decodeEventLog,
  getAddress,
  getEventSelector,
  type AbiEvent,
  type Address,
} from "viem";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { validateHex, type Hex } from "@axiom/config/types/hex";

import {
  ADDRESSES,
  EVENT_ABI,
  type AxiomEvent,
  type EventName,
  type IndexerContractAddresses,
} from "./events.js";

export const POLL_WINDOW_BLOCKS = 50n;

export const POLL_INTERVAL_MS = 12_000;

export const REORG_SAFE_DEPTH = 10n;

const wait = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));


function getCheckpointFile(chainId: bigint): string {
  return join(process.cwd(), "data", `checkpoint-${chainId}.json`);
}

export type EventTopicTable = { [K in EventName]: Hex };
const TOPIC_TABLE: EventTopicTable = Object.fromEntries(
  (Object.keys(EVENT_ABI) as EventName[]).map((n) => [
    n,
    validateHex(getEventSelector(EVENT_ABI[n])),
  ]),
) as EventTopicTable;

const TOPIC_TO_EVENT: Record<string, EventName> = {};
for (const n of Object.keys(TOPIC_TABLE) as EventName[]) {
  TOPIC_TO_EVENT[TOPIC_TABLE[n].toLowerCase()] = n;
}

export type WatchedEvent = {
  name: EventName;
  address: Address;
};

export function buildDefaultWatchList(
  addresses: IndexerContractAddresses = ADDRESSES,
): readonly WatchedEvent[] {
  return [
  { name: "Transfer", address: addresses.AXIOM_AGENT_NFT },
  { name: "Updated", address: addresses.AXIOM_AGENT_NFT },
  { name: "Authorization", address: addresses.AXIOM_AGENT_NFT },
  { name: "AuthorizationRevoked", address: addresses.AXIOM_AGENT_NFT },
  { name: "VerifierUpdated", address: addresses.AXIOM_AGENT_NFT },
  { name: "CreatorSet", address: addresses.AXIOM_AGENT_NFT },
  { name: "MintFeeUpdated", address: addresses.AXIOM_AGENT_NFT },
  { name: "StorageInfoUpdated", address: addresses.AXIOM_AGENT_NFT },
  { name: "PublishedSealedKey", address: addresses.AXIOM_AGENT_NFT },
  { name: "DelegateAccess", address: addresses.AXIOM_AGENT_NFT },
  { name: "Deposited", address: addresses.AXIOM_STRATEGY_VAULT },
  { name: "Withdrawn", address: addresses.AXIOM_STRATEGY_VAULT },
  { name: "StrategySet", address: addresses.AXIOM_STRATEGY_VAULT },
  { name: "Executed", address: addresses.AXIOM_STRATEGY_VAULT },
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

type BaseFields = {
  blockNumber: number;
  txHash: `0x${string}`;
  logIndex: number;
};

type EventParser = (log: Log, base: BaseFields) => AxiomEvent | null;

function makeEventParser(
  kind: AxiomEvent["kind"],
  abi: AbiEvent,
  extract: (args: Record<string, unknown>) => Record<string, unknown>,
): EventParser {
  return (log, base) => {
    const d = decodeEventLog({
      abi: [abi],
      data: (log.data ?? "0x") as `0x${string}`,
      topics: [
        (log.topics[0] ?? "0x") as `0x${string}`,
        ...log.topics.slice(1).map((t) => (t ?? "0x") as `0x${string}`),
      ],
      strict: true,
    });
    if (!d.args) return null;
    return {
      kind,
      ...base,
      ...extract(d.args as Record<string, unknown>),
    } as AxiomEvent;
  };
}

const EVENT_PARSERS: Record<string, EventParser> = {
  Transfer: makeEventParser("Transfer", EVENT_ABI.Transfer, (a) => ({
    from: getAddress(a["from"] as string),
    to: getAddress(a["to"] as string),
    tokenId: a["tokenId"] as bigint,
  })),
  Updated: makeEventParser("Updated", EVENT_ABI.Updated, (a) => ({
    tokenId: a["tokenId"] as bigint,
    oldDatasCount: (a["oldDatas"] as unknown[]).length,
    newDatasCount: (a["newDatas"] as unknown[]).length,
  })),
  Authorization: makeEventParser(
    "Authorization",
    EVENT_ABI.Authorization,
    (a) => ({
      tokenId: a["tokenId"] as bigint,
      from: getAddress(a["from"] as string),
      to: getAddress(a["to"] as string),
    }),
  ),
  AuthorizationRevoked: makeEventParser(
    "AuthorizationRevoked",
    EVENT_ABI.AuthorizationRevoked,
    (a) => ({
      tokenId: a["tokenId"] as bigint,
      from: getAddress(a["from"] as string),
      to: getAddress(a["to"] as string),
    }),
  ),
  VerifierUpdated: makeEventParser(
    "VerifierUpdated",
    EVENT_ABI.VerifierUpdated,
    (a) => ({
      oldVerifier: getAddress(a["oldVerifier"] as string),
      newVerifier: getAddress(a["newVerifier"] as string),
    }),
  ),
  CreatorSet: makeEventParser("CreatorSet", EVENT_ABI.CreatorSet, (a) => ({
    tokenId: a["tokenId"] as bigint,
    creator: getAddress(a["creator"] as string),
  })),
  MintFeeUpdated: makeEventParser(
    "MintFeeUpdated",
    EVENT_ABI.MintFeeUpdated,
    (a) => ({
      oldFee: a["oldFee"] as bigint,
      newFee: a["newFee"] as bigint,
    }),
  ),
  StorageInfoUpdated: makeEventParser(
    "StorageInfoUpdated",
    EVENT_ABI.StorageInfoUpdated,
    (a) => ({
      oldInfo: a["oldInfo"] as string,
      newInfo: a["newInfo"] as string,
    }),
  ),
  PublishedSealedKey: makeEventParser(
    "PublishedSealedKey",
    EVENT_ABI.PublishedSealedKey,
    (a) => ({
      to: getAddress(a["to"] as string),
      tokenId: a["tokenId"] as bigint,
      sealedKeys: a["sealedKeys"] as readonly Hex[],
    }),
  ),
  DelegateAccess: makeEventParser(
    "DelegateAccess",
    EVENT_ABI.DelegateAccess,
    (a) => ({
      user: getAddress(a["user"] as string),
      assistant: getAddress(a["assistant"] as string),
    }),
  ),
  Deposited: makeEventParser("Deposited", EVENT_ABI.Deposited, (a) => ({
    tokenId: a["tokenId"] as bigint,
    from: getAddress(a["from"] as string),
    asset: getAddress(a["asset"] as string),
    amount: a["amount"] as bigint,
  })),
  Withdrawn: makeEventParser("Withdrawn", EVENT_ABI.Withdrawn, (a) => ({
    tokenId: a["tokenId"] as bigint,
    to: getAddress(a["to"] as string),
    asset: getAddress(a["asset"] as string),
    amount: a["amount"] as bigint,
  })),
  StrategySet: makeEventParser("StrategySet", EVENT_ABI.StrategySet, (a) => ({
    tokenId: a["tokenId"] as bigint,
    strategyRoot: a["strategyRoot"] as Hex,
    dailyLimit: a["dailyLimit"] as bigint,
    validUntilDay: a["validUntilDay"] as bigint,
  })),
  Executed: makeEventParser("Executed", EVENT_ABI.Executed, (a) => ({
    tokenId: a["tokenId"] as bigint,
    actionHash: a["actionHash"] as Hex,
    target: getAddress(a["target"] as string),
    value: a["value"] as bigint,
    result: a["result"] as Hex,
  })),
  PaymentProcessed: makeEventParser(
    "PaymentProcessed",
    EVENT_ABI.PaymentProcessed,
    (a) => ({
      agentTokenId: a["agentTokenId"] as bigint,
      payer: getAddress(a["payer"] as string),
      creator: getAddress(a["creator"] as string),
      amount: a["amount"] as bigint,
      creatorCut: a["creatorCut"] as bigint,
      protocolCut: a["protocolCut"] as bigint,
    }),
  ),
  ComputeProviderPaid: makeEventParser(
    "ComputeProviderPaid",
    EVENT_ABI.ComputeProviderPaid,
    (a) => ({
      provider: getAddress(a["provider"] as string),
      amount: a["amount"] as bigint,
    }),
  ),
  EarningsWithdrawn: makeEventParser(
    "EarningsWithdrawn",
    EVENT_ABI.EarningsWithdrawn,
    (a) => ({
      creator: getAddress(a["creator"] as string),
      amount: a["amount"] as bigint,
    }),
  ),
  RoyaltySet: makeEventParser("RoyaltySet", EVENT_ABI.RoyaltySet, (a) => ({
    agentTokenId: a["agentTokenId"] as bigint,
    bps: a["bps"] as bigint,
  })),
  ProtocolTreasuryProposed: makeEventParser(
    "ProtocolTreasuryProposed",
    EVENT_ABI.ProtocolTreasuryProposed,
    (a) => ({
      proposedTreasury: getAddress(a["proposedTreasury"] as string),
      effectiveAt: a["effectiveAt"] as bigint,
    }),
  ),
  ProtocolTreasuryUpdated: makeEventParser(
    "ProtocolTreasuryUpdated",
    EVENT_ABI.ProtocolTreasuryUpdated,
    (a) => ({
      oldTreasury: getAddress(a["oldTreasury"] as string),
      newTreasury: getAddress(a["newTreasury"] as string),
    }),
  ),
  ProtocolTreasuryProposalCancelled: makeEventParser(
    "ProtocolTreasuryProposalCancelled",
    EVENT_ABI.ProtocolTreasuryProposalCancelled,
    (a) => ({
      pendingTreasury: getAddress(a["pendingTreasury"] as string),
    }),
  ),
  ProtocolFeeBpsUpdated: makeEventParser(
    "ProtocolFeeBpsUpdated",
    EVENT_ABI.ProtocolFeeBpsUpdated,
    (a) => ({
      oldBps: a["oldBps"] as bigint,
      newBps: a["newBps"] as bigint,
    }),
  ),
  PaymentTokenUpdated: makeEventParser(
    "PaymentTokenUpdated",
    EVENT_ABI.PaymentTokenUpdated,
    (a) => ({
      oldToken: getAddress(a["oldToken"] as string),
      newToken: getAddress(a["newToken"] as string),
    }),
  ),
  Cloned: makeEventParser("Cloned", EVENT_ABI.Cloned, (a) => ({
    tokenId: a["tokenId"] as bigint,
    newTokenId: a["newTokenId"] as bigint,
    from: getAddress(a["from"] as string),
    to: getAddress(a["to"] as string),
  })),
  MetadataJsonDecisionDocumented: makeEventParser(
    "MetadataJsonDecisionDocumented",
    EVENT_ABI.MetadataJsonDecisionDocumented,
    (a) => ({
      collectionName: a["collectionName"] as string,
      collectionSymbol: a["collectionSymbol"] as string,
      rationaleTag: a["rationaleTag"] as string,
    }),
  ),
  SignerProposed: makeEventParser(
    "SignerProposed",
    EVENT_ABI.SignerProposed,
    (a) => ({
      newSigner: getAddress(a["newSigner"] as string),
      executableAt: a["executableAt"] as bigint,
    }),
  ),
  SignerExecuted: makeEventParser(
    "SignerExecuted",
    EVENT_ABI.SignerExecuted,
    (a) => ({
      oldSigner: getAddress(a["oldSigner"] as string),
      newSigner: getAddress(a["newSigner"] as string),
    }),
  ),
  SignerProposalCancelled: makeEventParser(
    "SignerProposalCancelled",
    EVENT_ABI.SignerProposalCancelled,
    (a) => ({
      cancelledSigner: getAddress(a["cancelledSigner"] as string),
    }),
  ),
  Upgraded: makeEventParser("Upgraded", EVENT_ABI.Upgraded, (a) => ({
    implementation: getAddress(a["implementation"] as string),
  })),
  AdminChanged: makeEventParser(
    "AdminChanged",
    EVENT_ABI.AdminChanged,
    (a) => ({
      previousAdmin: getAddress(a["previousAdmin"] as string),
      newAdmin: getAddress(a["newAdmin"] as string),
    }),
  ),
  BeaconUpgraded: makeEventParser(
    "BeaconUpgraded",
    EVENT_ABI.BeaconUpgraded,
    (a) => ({
      beacon: getAddress(a["beacon"] as string),
    }),
  ),
  Initialized: makeEventParser("Initialized", EVENT_ABI.Initialized, (a) => ({
    version: Number(a["version"]),
  })),
};

export function decodeAxiomLog(log: Log) {
  const topic0 = log.topics[0];
  if (typeof topic0 !== "string") return null;
  const lowerTopic = topic0.toLowerCase();
  const name = TOPIC_TO_EVENT[lowerTopic];
  if (name === undefined) return null;

  const base: BaseFields = {
    blockNumber: Number(log.blockNumber),
    txHash: (log.transactionHash ?? "0x") as `0x${string}`,
    logIndex: Number(log.index),
  };

  const parser = EVENT_PARSERS[name];
  if (!parser) return null;
  return parser(log, base);
}

export async function pollOnce(
  provider: JsonRpcProvider,
  watchList: readonly WatchedEvent[],
  fromBlock: bigint,
  window: bigint,
) {
  const toBlock = fromBlock + window - 1n;

  const allLogs: Log[] = [];
  for (const { name, address } of watchList) {
    const filter = {
      address,
      topics: [TOPIC_TABLE[name]],
      fromBlock,
      toBlock,
    };
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

async function loadCheckpoint(chainId: bigint): Promise<number | null> {
  const checkpointFile = getCheckpointFile(chainId);
  try {
    const data = await readFile(checkpointFile, "utf-8");
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
    await mkdir(dirname(checkpointFile), { recursive: true });
    await writeFile(
      tmp,
      JSON.stringify({ nextBlock, updatedAt: Date.now() }),
      "utf-8",
    );
    await rename(tmp, checkpointFile);
  } catch (err) {
    console.error("[watcher] failed to save checkpoint:", err);
  }
}

export class Watcher {
  readonly provider: JsonRpcProvider;
  readonly watchList: readonly WatchedEvent[];
  readonly window: bigint;
  readonly intervalMs: number;
  readonly sink: EventSink;
  readonly logger: (line: Record<string, unknown>) => void;
  private nextBlock: bigint;
  private running = false;
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

  start() {
    if (this.running) throw new Error("Watcher already running");
    this.running = true;
    const { promise: stopped, resolve: resolveStopped } =
      Promise.withResolvers<void>();
    let chainId: bigint | null = null;

    const getChainId = async (): Promise<bigint> => {
      if (chainId !== null) return chainId;
      const network = await this.provider.getNetwork();
      chainId = network.chainId;
      return chainId;
    };

    const tick = async (): Promise<void> => {
      if (!this.running) return;
      try {
        const id = await getChainId();
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
    };

    const loop = async (): Promise<void> => {
      try {
        const id = await getChainId();
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
        await tick();
        if (!this.running) break;
        await wait(this.intervalMs);
      }
      resolveStopped();
    };
    void loop();

    return {
      stop: async (): Promise<void> => {
        this.running = false;
        await stopped;
      },
    };
  }
}
