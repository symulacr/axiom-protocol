import { ethers } from "ethers";
import type { JsonRpcProvider, Log } from "ethers";
import { decodeEventLog, getAddress, type AbiEvent, type Address } from "viem";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { validateHex, type Hex } from "@axiom/config/types/hex";

import { ADDRESSES, EVENT_ABI, type AxiomEvent, type EventName } from "./events.js";

export const POLL_WINDOW_BLOCKS = 50n;

export const POLL_INTERVAL_MS = 12_000;

// 0G's eth_getLogs rejects ranges past chain head with -32000.
// We bound the window to the live head on every tick.

const CHECKPOINT_FILE = join(process.cwd(), "data", "checkpoint.json");

export type EventTopicTable = { [K in EventName]: Hex };
const TOPIC_TABLE: EventTopicTable = {
  Transfer: validateHex(ethers.id("Transfer(address,address,uint256)")),
  Updated: validateHex(ethers.id("Updated(uint256,(string,bytes32)[],(string,bytes32)[])")),
  Authorization: validateHex(ethers.id("Authorization(address,address,uint256)")),
  AuthorizationRevoked: validateHex(ethers.id("AuthorizationRevoked(uint256,address,address)")),
  VerifierUpdated: validateHex(ethers.id("VerifierUpdated(address,address)")),
  CreatorSet: validateHex(ethers.id("CreatorSet(uint256,address)")),
  MintFeeUpdated: validateHex(ethers.id("MintFeeUpdated(uint256,uint256)")),
  StorageInfoUpdated: validateHex(ethers.id("StorageInfoUpdated(string,string)")),
  PublishedSealedKey: validateHex(ethers.id("PublishedSealedKey(address,uint256,bytes[])")),
  DelegateAccess: validateHex(ethers.id("DelegateAccess(address,address)")),
  Deposited: validateHex(ethers.id("Deposited(uint256,address,address,uint256)")),
  Withdrawn: validateHex(ethers.id("Withdrawn(uint256,address,address,uint256)")),
  StrategySet: validateHex(ethers.id("StrategySet(uint256,bytes32,uint256,uint64)")),
  Executed: validateHex(ethers.id("Executed(uint256,bytes32,address,uint256,bytes)")),
  RegistryUpdated: validateHex(ethers.id("RegistryUpdated(address)")),
  // AxiomPaymentProcessor
  PaymentProcessed: validateHex(ethers.id("PaymentProcessed(uint256,address,address,uint256,uint256,uint256)")),
  ComputeProviderPaid: validateHex(ethers.id("ComputeProviderPaid(address,uint256)")),
  EarningsWithdrawn: validateHex(ethers.id("EarningsWithdrawn(address,uint256)")),
  RoyaltySet: validateHex(ethers.id("RoyaltySet(uint256,uint256)")),
  ProtocolTreasuryUpdated: validateHex(ethers.id("ProtocolTreasuryUpdated(address,address)")),
  ProtocolFeeBpsUpdated: validateHex(ethers.id("ProtocolFeeBpsUpdated(uint256,uint256)")),
  PaymentTokenUpdated: validateHex(ethers.id("PaymentTokenUpdated(address,address)")),
  // ERC7857Cloneable / AxiomAgentNFT metadata / AxiomTeeVerifier
  Cloned: validateHex(ethers.id("Cloned(uint256,uint256,address,address)")),
  MetadataJsonDecisionDocumented: validateHex(ethers.id("MetadataJsonDecisionDocumented(string,string,string)")),
  SignerRegistered: validateHex(ethers.id("SignerRegistered(address,address)")),
  // ERC-1967 proxy events
  Upgraded: validateHex(ethers.id("Upgraded(address)")),
  AdminChanged: validateHex(ethers.id("AdminChanged(address,address)")),
  BeaconUpgraded: validateHex(ethers.id("BeaconUpgraded(address)")),
  // OpenZeppelin Initializable
  Initialized: validateHex(ethers.id("Initialized(uint64)")),
 };

const TOPIC_TO_EVENT: Record<string, EventName> = {};
{
  // Must match EVENT_SIGNATURES keys in events.ts.
  const eventNames: EventName[] = [
    "Transfer", "Updated", "Authorization", "AuthorizationRevoked",
    "VerifierUpdated", "CreatorSet", "MintFeeUpdated", "StorageInfoUpdated",
    "PublishedSealedKey", "DelegateAccess", "Deposited", "Withdrawn",
    "StrategySet", "Executed", "RegistryUpdated",
    "PaymentProcessed", "ComputeProviderPaid", "EarningsWithdrawn", "RoyaltySet",
    "ProtocolTreasuryUpdated", "ProtocolFeeBpsUpdated", "PaymentTokenUpdated",
    "Cloned", "MetadataJsonDecisionDocumented", "SignerRegistered",
    "Upgraded", "AdminChanged", "BeaconUpgraded", "Initialized",
  ];
  for (const n of eventNames) {
    TOPIC_TO_EVENT[TOPIC_TABLE[n].toLowerCase()] = n;
  }
}

export type WatchedEvent = {
  name: EventName;
  address: Address;
};

export const DEFAULT_WATCH_LIST: readonly WatchedEvent[] = [
  // AxiomAgentNFT
  { name: "Transfer", address: ADDRESSES.AXIOM_AGENT_NFT },
  { name: "Updated", address: ADDRESSES.AXIOM_AGENT_NFT },
  { name: "Authorization", address: ADDRESSES.AXIOM_AGENT_NFT },
  { name: "AuthorizationRevoked", address: ADDRESSES.AXIOM_AGENT_NFT },
  { name: "VerifierUpdated", address: ADDRESSES.AXIOM_AGENT_NFT },
  { name: "CreatorSet", address: ADDRESSES.AXIOM_AGENT_NFT },
  { name: "MintFeeUpdated", address: ADDRESSES.AXIOM_AGENT_NFT },
  { name: "StorageInfoUpdated", address: ADDRESSES.AXIOM_AGENT_NFT },
  { name: "PublishedSealedKey", address: ADDRESSES.AXIOM_AGENT_NFT },
  { name: "DelegateAccess", address: ADDRESSES.AXIOM_AGENT_NFT },
  // AxiomStrategyVault
  { name: "Deposited", address: ADDRESSES.AXIOM_STRATEGY_VAULT },
  { name: "Withdrawn", address: ADDRESSES.AXIOM_STRATEGY_VAULT },
  { name: "StrategySet", address: ADDRESSES.AXIOM_STRATEGY_VAULT },
  { name: "Executed", address: ADDRESSES.AXIOM_STRATEGY_VAULT },
  { name: "RegistryUpdated", address: ADDRESSES.AXIOM_STRATEGY_VAULT },
  // AxiomPaymentProcessor
  { name: "PaymentProcessed", address: ADDRESSES.AXIOM_PAYMENT_PROCESSOR },
  { name: "ComputeProviderPaid", address: ADDRESSES.AXIOM_PAYMENT_PROCESSOR },
  { name: "EarningsWithdrawn", address: ADDRESSES.AXIOM_PAYMENT_PROCESSOR },
  { name: "RoyaltySet", address: ADDRESSES.AXIOM_PAYMENT_PROCESSOR },
  { name: "ProtocolTreasuryUpdated", address: ADDRESSES.AXIOM_PAYMENT_PROCESSOR },
  { name: "ProtocolFeeBpsUpdated", address: ADDRESSES.AXIOM_PAYMENT_PROCESSOR },
  { name: "PaymentTokenUpdated", address: ADDRESSES.AXIOM_PAYMENT_PROCESSOR },
  // AxiomAgentNFT (metadata decision + ERC7857Cloneable Cloned)
  { name: "MetadataJsonDecisionDocumented", address: ADDRESSES.AXIOM_AGENT_NFT },
  { name: "Cloned", address: ADDRESSES.AXIOM_AGENT_NFT },
  // AxiomTeeVerifier
  { name: "SignerRegistered", address: ADDRESSES.AXIOM_TEE_VERIFIER },
  // ERC-1967 proxy events (emitted by the ERC1967Proxy at AXIOM_AGENT_NFT)
  { name: "Upgraded", address: ADDRESSES.AXIOM_AGENT_NFT },
  { name: "AdminChanged", address: ADDRESSES.AXIOM_AGENT_NFT },
  { name: "BeaconUpgraded", address: ADDRESSES.AXIOM_AGENT_NFT },
  { name: "Initialized", address: ADDRESSES.AXIOM_AGENT_NFT },
];

export type EventSink = (event: AxiomEvent) => void | Promise<void>;

export type WatcherOptions = {
  provider: JsonRpcProvider;
  watchList?: readonly WatchedEvent[];
  pollWindow?: bigint;
  pollIntervalMs?: number;
  sink: EventSink;
  /** Block number to start from. Defaults to "latest - window". */
  startBlock?: bigint;
  /** Logger sink for non-event status lines (one JSON line per message). */
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
    return { kind, ...base, ...extract(d.args as Record<string, unknown>) } as AxiomEvent;
  };
}

const EVENT_PARSERS: Record<string, EventParser> = {
  // AxiomAgentNFT events
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
  Authorization: makeEventParser("Authorization", EVENT_ABI.Authorization, (a) => ({
    tokenId: a["tokenId"] as bigint,
    from: getAddress(a["from"] as string),
    to: getAddress(a["to"] as string),
  })),
  AuthorizationRevoked: makeEventParser("AuthorizationRevoked", EVENT_ABI.AuthorizationRevoked, (a) => ({
    tokenId: a["tokenId"] as bigint,
    from: getAddress(a["from"] as string),
    to: getAddress(a["to"] as string),
  })),
  VerifierUpdated: makeEventParser("VerifierUpdated", EVENT_ABI.VerifierUpdated, (a) => ({
    oldVerifier: getAddress(a["oldVerifier"] as string),
    newVerifier: getAddress(a["newVerifier"] as string),
  })),
  CreatorSet: makeEventParser("CreatorSet", EVENT_ABI.CreatorSet, (a) => ({
    tokenId: a["tokenId"] as bigint,
    creator: getAddress(a["creator"] as string),
  })),
  MintFeeUpdated: makeEventParser("MintFeeUpdated", EVENT_ABI.MintFeeUpdated, (a) => ({
    oldFee: a["oldFee"] as bigint,
    newFee: a["newFee"] as bigint,
  })),
  StorageInfoUpdated: makeEventParser("StorageInfoUpdated", EVENT_ABI.StorageInfoUpdated, (a) => ({
    oldInfo: a["oldInfo"] as string,
    newInfo: a["newInfo"] as string,
  })),
  PublishedSealedKey: makeEventParser("PublishedSealedKey", EVENT_ABI.PublishedSealedKey, (a) => ({
    to: getAddress(a["to"] as string),
    tokenId: a["tokenId"] as bigint,
    sealedKeys: a["sealedKeys"] as readonly Hex[],
  })),
  DelegateAccess: makeEventParser("DelegateAccess", EVENT_ABI.DelegateAccess, (a) => ({
    user: getAddress(a["user"] as string),
    assistant: getAddress(a["assistant"] as string),
  })),
  // AxiomStrategyVault events
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
  RegistryUpdated: makeEventParser("RegistryUpdated", EVENT_ABI.RegistryUpdated, (a) => ({
    nft: getAddress(a["nft"] as string),
  })),
  // AxiomPaymentProcessor events
  PaymentProcessed: makeEventParser("PaymentProcessed", EVENT_ABI.PaymentProcessed, (a) => ({
    agentTokenId: a["agentTokenId"] as bigint,
    payer: getAddress(a["payer"] as string),
    creator: getAddress(a["creator"] as string),
    amount: a["amount"] as bigint,
    creatorCut: a["creatorCut"] as bigint,
    protocolCut: a["protocolCut"] as bigint,
  })),
  ComputeProviderPaid: makeEventParser("ComputeProviderPaid", EVENT_ABI.ComputeProviderPaid, (a) => ({
    provider: getAddress(a["provider"] as string),
    amount: a["amount"] as bigint,
  })),
  EarningsWithdrawn: makeEventParser("EarningsWithdrawn", EVENT_ABI.EarningsWithdrawn, (a) => ({
    creator: getAddress(a["creator"] as string),
    amount: a["amount"] as bigint,
  })),
  RoyaltySet: makeEventParser("RoyaltySet", EVENT_ABI.RoyaltySet, (a) => ({
    agentTokenId: a["agentTokenId"] as bigint,
    bps: a["bps"] as bigint,
  })),
  ProtocolTreasuryUpdated: makeEventParser("ProtocolTreasuryUpdated", EVENT_ABI.ProtocolTreasuryUpdated, (a) => ({
    oldTreasury: getAddress(a["oldTreasury"] as string),
    newTreasury: getAddress(a["newTreasury"] as string),
  })),
  ProtocolFeeBpsUpdated: makeEventParser("ProtocolFeeBpsUpdated", EVENT_ABI.ProtocolFeeBpsUpdated, (a) => ({
    oldBps: a["oldBps"] as bigint,
    newBps: a["newBps"] as bigint,
  })),
  PaymentTokenUpdated: makeEventParser("PaymentTokenUpdated", EVENT_ABI.PaymentTokenUpdated, (a) => ({
    oldToken: getAddress(a["oldToken"] as string),
    newToken: getAddress(a["newToken"] as string),
  })),
  // ERC7857Cloneable / AxiomAgentNFT metadata / AxiomTeeVerifier
  Cloned: makeEventParser("Cloned", EVENT_ABI.Cloned, (a) => ({
    tokenId: a["tokenId"] as bigint,
    newTokenId: a["newTokenId"] as bigint,
    from: getAddress(a["from"] as string),
    to: getAddress(a["to"] as string),
  })),
  MetadataJsonDecisionDocumented: makeEventParser("MetadataJsonDecisionDocumented", EVENT_ABI.MetadataJsonDecisionDocumented, (a) => ({
    collectionName: a["collectionName"] as string,
    collectionSymbol: a["collectionSymbol"] as string,
    rationaleTag: a["rationaleTag"] as string,
  })),
  SignerRegistered: makeEventParser("SignerRegistered", EVENT_ABI.SignerRegistered, (a) => ({
    oldSigner: getAddress(a["oldSigner"] as string),
    newSigner: getAddress(a["newSigner"] as string),
  })),
  // ERC-1967 proxy events
  Upgraded: makeEventParser("Upgraded", EVENT_ABI.Upgraded, (a) => ({
    implementation: getAddress(a["implementation"] as string),
  })),
  AdminChanged: makeEventParser("AdminChanged", EVENT_ABI.AdminChanged, (a) => ({
    previousAdmin: getAddress(a["previousAdmin"] as string),
    newAdmin: getAddress(a["newAdmin"] as string),
  })),
  BeaconUpgraded: makeEventParser("BeaconUpgraded", EVENT_ABI.BeaconUpgraded, (a) => ({
    beacon: getAddress(a["beacon"] as string),
  })),
  // OpenZeppelin Initializable
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

/** Run a single poll tick: fetch logs in `[fromBlock, fromBlock + window)`. */
export async function pollOnce(
  provider: JsonRpcProvider,
  watchList: readonly WatchedEvent[],
  fromBlock: bigint,
  window: bigint,
) {
  const toBlock = fromBlock + window - 1n;

  // One call per (event, address) pair — cheap to error-isolate.
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

async function loadCheckpoint(): Promise<number | null> {
  try {
    const data = await readFile(CHECKPOINT_FILE, "utf-8");
    const parsed = JSON.parse(data);
    if (typeof parsed.nextBlock === "number" && Number.isInteger(parsed.nextBlock) && parsed.nextBlock > 0) {
      return parsed.nextBlock;
    }
  } catch {
  }
  return null;
}

async function saveCheckpoint(nextBlock: number): Promise<void> {
  const tmp = CHECKPOINT_FILE + ".tmp";
  try {
    await mkdir(dirname(CHECKPOINT_FILE), { recursive: true });
    await writeFile(tmp, JSON.stringify({ nextBlock, updatedAt: Date.now() }), "utf-8");
    await rename(tmp, CHECKPOINT_FILE);
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
      opts.logger ?? ((line) => console.error(JSON.stringify({ level: "info", ...line })));
    this.nextBlock = opts.startBlock ?? 0n;
  }

  get cursor(): bigint {
    return this.nextBlock;
  }

  start() {
    if (this.running) throw new Error("Watcher already running");
    this.running = true;
    const { promise: stopped, resolve: resolveStopped } = Promise.withResolvers<void>();
    const tick = async (): Promise<void> => {
      if (!this.running) return;
      try {
        // Fetch the live chain head on every tick so the window never
        // overshoots the chain head (0G rejects ranges past head with
        // error code -32000).
        const head = await this.provider.getBlockNumber();
        const latest = BigInt(head);

        // First-run seed: look back one window so the first tick has data.
        if (this.nextBlock === 0n) {
          this.nextBlock = latest >= this.window ? latest - this.window : 0n;
        }

        // Clamp a stale cursor that has run past the head back to `latest`.
        // Without this, a tick that fires after the loop was paused longer
        // than `window / blockTime` would set `from > latest` and trip the
        // same "invalid block range params" error.
        const fromBlock = this.nextBlock < latest ? this.nextBlock : latest;

        // Cap `toBlock` at the live head so the query window is always a
        // subset of `[0, latest]`. This is the load-bearing fix.
        const windowEnd = fromBlock + this.window - 1n;
        const toBlock = windowEnd > latest ? latest : windowEnd;

        // If the chain hasn't moved (or `latest` is 0), there's nothing to
        // query yet — skip the tick without advancing the cursor so the
        // next tick can retry.
        if (toBlock < fromBlock) {
          this.logger({
            msg: "poll tick skipped",
            reason: "head not advanced",
            latest: latest.toString(),
            cursor: this.nextBlock.toString(),
          });
          return;
        }

        // Range derived from clamped toBlock — tells pollOnce exactly what we want.
        const range = toBlock - fromBlock + 1n;
        const logs = await pollOnce(this.provider, this.watchList, fromBlock, range);
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
        this.nextBlock = toBlock + 1n;
        await saveCheckpoint(Number(this.nextBlock));
        this.consecutiveFailures = 0;
        this.logger({
          msg: "poll tick",
          fromBlock: fromBlock.toString(),
          toBlock: toBlock.toString(),
          latest: latest.toString(),
          nextBlock: this.nextBlock.toString(),
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
          this.logger({ level: "fatal", msg: "max consecutive failures reached — stopping" });
          this.running = false;
          const { promise, resolve } = Promise.withResolvers<void>();
          setTimeout(resolve, this.intervalMs);
          await promise;
          return;
        }
        // Exponential backoff with 60s cap
        const backoff = Math.min(this.intervalMs * Math.pow(2, this.consecutiveFailures), 60_000);
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, backoff);
        await promise;
      }
    };

    const loop = async (): Promise<void> => {
      // Load persisted checkpoint before first tick so we resume from
      // where we left off rather than falling back to head - window.
      const savedBlock = await loadCheckpoint();
      if (savedBlock !== null) {
        console.log(`[watcher] resuming from checkpoint block ${savedBlock}`);
        this.nextBlock = BigInt(savedBlock);
      }

      while (this.running) {
        await tick();
        if (!this.running) break;
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, this.intervalMs);
        await promise;
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


