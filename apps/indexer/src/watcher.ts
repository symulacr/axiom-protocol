import { ethers } from "ethers";
import type { JsonRpcProvider, Log } from "ethers";
import { decodeEventLog, getAddress, type Address } from "viem";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { validateHex, toViemHex, type Hex } from "@axiom/config/types/hex";

import { ADDRESSES, EVENT_ABI, type AxiomEvent, type EventName } from "./events.js";

/** How many blocks to query per `eth_getLogs` call. */
export const POLL_WINDOW_BLOCKS = 50n;

/** Polling cadence in milliseconds. */
export const POLL_INTERVAL_MS = 12_000;

/**
 * 0G's `eth_getLogs` rejects ranges that overshoot the chain head with
 * error code -32000. We bound the window to the live head on every tick.
 */

/** Path to the persisted checkpoint file (stores nextBlock cursor). */
const CHECKPOINT_FILE = join(process.cwd(), "data", "checkpoint.json");

/** Pre-computed topic-0 (event hash) for every signature we care about. */
export type EventTopicTable = { [K in EventName]: Hex };
const TOPIC_TABLE: EventTopicTable = {
  // On-chain topic-0 is keccak256(canonicalSignature) where the canonical
  // form is `Name(type1,type2,...)` — no `event` prefix, no `indexed`
  // keyword, no parameter names. The `indexed`/name fields affect ONLY
  // which topics 1..n are populated, not the topic-0 hash.
  Transfer: validateHex(ethers.id("Transfer(address,address,uint256)")),
  Updated: validateHex(ethers.id("Updated(uint256,(string,bytes32)[],(string,bytes32)[])")),
  Authorization: validateHex(ethers.id("Authorization(uint256,address,address)")),
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

/** Reverse lookup: lowercased topic-0 hex → event name. */
const TOPIC_TO_EVENT: Record<string, EventName> = {};
{
  // Explicit list — must match EVENT_SIGNATURES keys in events.ts.
  // TypeScript validates every entry against `EventName`.
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

/** Subscription shape: (event name, contract address) pairs to watch. */
export type WatchedEvent = {
  name: EventName;
  address: Address;
};

/** The default watch list — every event the indexer cares about, all contracts. */
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

/** Sink function. Async or sync; errors propagate to the caller. */
export type EventSink = (event: AxiomEvent) => void | Promise<void>;

/** Watcher constructor options. */
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

/** Common fields every `AxiomEvent` carries. */
type BaseFields = {
  blockNumber: number;
  txHash: `0x${string}`;
  logIndex: number;
};

/**
 * Decode one raw log into an `AxiomEvent` via per-event ABI items.
 * Returns `null` for unmatched signatures.
 */
export function decodeAxiomLog(log: Log) {
  const topic0 = log.topics[0];
  if (typeof topic0 !== "string") return null;
  // Find the event name whose topic0 matches.
  const lowerTopic = topic0.toLowerCase();
  const name = TOPIC_TO_EVENT[lowerTopic];
  if (name === undefined) return null;

  const base: BaseFields = {
    blockNumber: Number(log.blockNumber),
    txHash: toViemHex(validateHex(log.transactionHash ?? "0x", "transactionHash")),
    logIndex: Number(log.index),
  };

  const data = toViemHex(validateHex(log.data ?? "0x", "log.data"));
  const topics: [`0x${string}`, ...`0x${string}`[]] = [
    toViemHex(validateHex(log.topics[0] ?? "0x", "topic")),
    ...log.topics.slice(1).map(t => toViemHex(validateHex(t ?? "0x", "topic"))),
  ];

  switch (name) {
    case "Transfer": {
      const d = decodeEventLog({ abi: [EVENT_ABI.Transfer], data, topics, strict: true });
      return {
        kind: "Transfer",
        ...base,
        from: getAddress(d.args.from),
        to: getAddress(d.args.to),
        tokenId: d.args.tokenId,
      } satisfies Extract<AxiomEvent, { kind: "Transfer" }>;
    }
    case "Updated": {
      const d = decodeEventLog({ abi: [EVENT_ABI.Updated], data, topics, strict: true });
      return {
        kind: "Updated",
        ...base,
        tokenId: d.args.tokenId,
        oldDatasCount: d.args.oldDatas.length,
        newDatasCount: d.args.newDatas.length,
      } satisfies Extract<AxiomEvent, { kind: "Updated" }>;
    }
    case "Authorization": {
      const d = decodeEventLog({ abi: [EVENT_ABI.Authorization], data, topics, strict: true });
      return {
        kind: "Authorization",
        ...base,
        tokenId: d.args.tokenId,
        from: getAddress(d.args.from),
        to: getAddress(d.args.to),
      } satisfies Extract<AxiomEvent, { kind: "Authorization" }>;
    }
    case "AuthorizationRevoked": {
      const d = decodeEventLog({ abi: [EVENT_ABI.AuthorizationRevoked], data, topics, strict: true });
      return {
        kind: "AuthorizationRevoked",
        ...base,
        tokenId: d.args.tokenId,
        from: getAddress(d.args.from),
        to: getAddress(d.args.to),
      } satisfies Extract<AxiomEvent, { kind: "AuthorizationRevoked" }>;
    }
    case "VerifierUpdated": {
      const d = decodeEventLog({ abi: [EVENT_ABI.VerifierUpdated], data, topics, strict: true });
      return {
        kind: "VerifierUpdated",
        ...base,
        oldVerifier: getAddress(d.args.oldVerifier),
        newVerifier: getAddress(d.args.newVerifier),
      } satisfies Extract<AxiomEvent, { kind: "VerifierUpdated" }>;
    }
    case "CreatorSet": {
      const d = decodeEventLog({ abi: [EVENT_ABI.CreatorSet], data, topics, strict: true });
      return {
        kind: "CreatorSet",
        ...base,
        tokenId: d.args.tokenId,
        creator: getAddress(d.args.creator),
      } satisfies Extract<AxiomEvent, { kind: "CreatorSet" }>;
    }
    case "MintFeeUpdated": {
      const d = decodeEventLog({ abi: [EVENT_ABI.MintFeeUpdated], data, topics, strict: true });
      return {
        kind: "MintFeeUpdated",
        ...base,
        oldFee: d.args.oldFee,
        newFee: d.args.newFee,
      } satisfies Extract<AxiomEvent, { kind: "MintFeeUpdated" }>;
    }
    case "StorageInfoUpdated": {
      const d = decodeEventLog({ abi: [EVENT_ABI.StorageInfoUpdated], data, topics, strict: true });
      return {
        kind: "StorageInfoUpdated",
        ...base,
        oldInfo: d.args.oldInfo,
        newInfo: d.args.newInfo,
      } satisfies Extract<AxiomEvent, { kind: "StorageInfoUpdated" }>;
    }
    case "PublishedSealedKey": {
      const d = decodeEventLog({ abi: [EVENT_ABI.PublishedSealedKey], data, topics, strict: true });
      return {
        kind: "PublishedSealedKey",
        ...base,
        to: getAddress(d.args.to),
        tokenId: d.args.tokenId,
        sealedKeys: d.args.sealedKeys,
      } satisfies Extract<AxiomEvent, { kind: "PublishedSealedKey" }>;
    }
    case "DelegateAccess": {
      const d = decodeEventLog({ abi: [EVENT_ABI.DelegateAccess], data, topics, strict: true });
      return {
        kind: "DelegateAccess",
        ...base,
        user: getAddress(d.args.user),
        assistant: getAddress(d.args.assistant),
      } satisfies Extract<AxiomEvent, { kind: "DelegateAccess" }>;
    }
    case "Deposited": {
      const d = decodeEventLog({ abi: [EVENT_ABI.Deposited], data, topics, strict: true });
      return {
        kind: "Deposited",
        ...base,
        tokenId: d.args.tokenId,
        from: getAddress(d.args.from),
        asset: getAddress(d.args.asset),
        amount: d.args.amount,
      } satisfies Extract<AxiomEvent, { kind: "Deposited" }>;
    }
    case "Withdrawn": {
      const d = decodeEventLog({ abi: [EVENT_ABI.Withdrawn], data, topics, strict: true });
      return {
        kind: "Withdrawn",
        ...base,
        tokenId: d.args.tokenId,
        to: getAddress(d.args.to),
        asset: getAddress(d.args.asset),
        amount: d.args.amount,
      } satisfies Extract<AxiomEvent, { kind: "Withdrawn" }>;
    }
    case "StrategySet": {
      const d = decodeEventLog({ abi: [EVENT_ABI.StrategySet], data, topics, strict: true });
      return {
        kind: "StrategySet",
        ...base,
        tokenId: d.args.tokenId,
        strategyRoot: d.args.strategyRoot,
        dailyLimit: d.args.dailyLimit,
        validUntilDay: d.args.validUntilDay,
      } satisfies Extract<AxiomEvent, { kind: "StrategySet" }>;
    }
    case "Executed": {
      const d = decodeEventLog({ abi: [EVENT_ABI.Executed], data, topics, strict: true });
      return {
        kind: "Executed",
        ...base,
        tokenId: d.args.tokenId,
        actionHash: d.args.actionHash,
        target: getAddress(d.args.target),
        value: d.args.value,
        result: d.args.result,
      } satisfies Extract<AxiomEvent, { kind: "Executed" }>;
    }
    case "RegistryUpdated": {
      const d = decodeEventLog({ abi: [EVENT_ABI.RegistryUpdated], data, topics, strict: true });
      return {
        kind: "RegistryUpdated",
        ...base,
        nft: getAddress(d.args.nft),
      } satisfies Extract<AxiomEvent, { kind: "RegistryUpdated" }>;
    }
    // ── AxiomPaymentProcessor ─────────────────────────────────────────
    case "PaymentProcessed": {
      const d = decodeEventLog({ abi: [EVENT_ABI.PaymentProcessed], data, topics, strict: true });
      return {
        kind: "PaymentProcessed",
        ...base,
        agentTokenId: d.args.agentTokenId,
        payer: getAddress(d.args.payer),
        creator: getAddress(d.args.creator),
        amount: d.args.amount,
        creatorCut: d.args.creatorCut,
        protocolCut: d.args.protocolCut,
      } satisfies Extract<AxiomEvent, { kind: "PaymentProcessed" }>;
    }
    case "ComputeProviderPaid": {
      const d = decodeEventLog({ abi: [EVENT_ABI.ComputeProviderPaid], data, topics, strict: true });
      return {
        kind: "ComputeProviderPaid",
        ...base,
        provider: getAddress(d.args.provider),
        amount: d.args.amount,
      } satisfies Extract<AxiomEvent, { kind: "ComputeProviderPaid" }>;
    }
    case "EarningsWithdrawn": {
      const d = decodeEventLog({ abi: [EVENT_ABI.EarningsWithdrawn], data, topics, strict: true });
      return {
        kind: "EarningsWithdrawn",
        ...base,
        creator: getAddress(d.args.creator),
        amount: d.args.amount,
      } satisfies Extract<AxiomEvent, { kind: "EarningsWithdrawn" }>;
    }
    case "RoyaltySet": {
      const d = decodeEventLog({ abi: [EVENT_ABI.RoyaltySet], data, topics, strict: true });
      return {
        kind: "RoyaltySet",
        ...base,
        agentTokenId: d.args.agentTokenId,
        bps: d.args.bps,
      } satisfies Extract<AxiomEvent, { kind: "RoyaltySet" }>;
    }
    case "ProtocolTreasuryUpdated": {
      const d = decodeEventLog({ abi: [EVENT_ABI.ProtocolTreasuryUpdated], data, topics, strict: true });
      return {
        kind: "ProtocolTreasuryUpdated",
        ...base,
        oldTreasury: getAddress(d.args.oldTreasury),
        newTreasury: getAddress(d.args.newTreasury),
      } satisfies Extract<AxiomEvent, { kind: "ProtocolTreasuryUpdated" }>;
    }
    case "ProtocolFeeBpsUpdated": {
      const d = decodeEventLog({ abi: [EVENT_ABI.ProtocolFeeBpsUpdated], data, topics, strict: true });
      return {
        kind: "ProtocolFeeBpsUpdated",
        ...base,
        oldBps: d.args.oldBps,
        newBps: d.args.newBps,
      } satisfies Extract<AxiomEvent, { kind: "ProtocolFeeBpsUpdated" }>;
    }
    case "PaymentTokenUpdated": {
      const d = decodeEventLog({ abi: [EVENT_ABI.PaymentTokenUpdated], data, topics, strict: true });
      return {
        kind: "PaymentTokenUpdated",
        ...base,
        oldToken: getAddress(d.args.oldToken),
        newToken: getAddress(d.args.newToken),
      } satisfies Extract<AxiomEvent, { kind: "PaymentTokenUpdated" }>;
    }
    // ── ERC7857Cloneable ──────────────────────────────────────────────
    case "Cloned": {
      const d = decodeEventLog({ abi: [EVENT_ABI.Cloned], data, topics, strict: true });
      return {
        kind: "Cloned",
        ...base,
        tokenId: d.args.tokenId,
        newTokenId: d.args.newTokenId,
        from: getAddress(d.args.from),
        to: getAddress(d.args.to),
      } satisfies Extract<AxiomEvent, { kind: "Cloned" }>;
    }
    // ── AxiomAgentNFT (metadata decision) ─────────────────────────────
    case "MetadataJsonDecisionDocumented": {
      const d = decodeEventLog({ abi: [EVENT_ABI.MetadataJsonDecisionDocumented], data, topics, strict: true });
      return {
        kind: "MetadataJsonDecisionDocumented",
        ...base,
        collectionName: d.args.collectionName,
        collectionSymbol: d.args.collectionSymbol,
        rationaleTag: d.args.rationaleTag,
      } satisfies Extract<AxiomEvent, { kind: "MetadataJsonDecisionDocumented" }>;
    }
    // ── AxiomTeeVerifier ──────────────────────────────────────────────
    case "SignerRegistered": {
      const d = decodeEventLog({ abi: [EVENT_ABI.SignerRegistered], data, topics, strict: true });
      return {
        kind: "SignerRegistered",
        ...base,
        oldSigner: getAddress(d.args.oldSigner),
        newSigner: getAddress(d.args.newSigner),
      } satisfies Extract<AxiomEvent, { kind: "SignerRegistered" }>;
    }
    // ── ERC-1967 proxy events ─────────────────────────────────────────
    case "Upgraded": {
      const d = decodeEventLog({ abi: [EVENT_ABI.Upgraded], data, topics, strict: true });
      return {
        kind: "Upgraded",
        ...base,
        implementation: getAddress(d.args.implementation),
      } satisfies Extract<AxiomEvent, { kind: "Upgraded" }>;
    }
    case "AdminChanged": {
      const d = decodeEventLog({ abi: [EVENT_ABI.AdminChanged], data, topics, strict: true });
      return {
        kind: "AdminChanged",
        ...base,
        previousAdmin: getAddress(d.args.previousAdmin),
        newAdmin: getAddress(d.args.newAdmin),
      } satisfies Extract<AxiomEvent, { kind: "AdminChanged" }>;
    }
    case "BeaconUpgraded": {
      const d = decodeEventLog({ abi: [EVENT_ABI.BeaconUpgraded], data, topics, strict: true });
      return {
        kind: "BeaconUpgraded",
        ...base,
        beacon: getAddress(d.args.beacon),
      } satisfies Extract<AxiomEvent, { kind: "BeaconUpgraded" }>;
    }
    // ── OpenZeppelin Initializable ────────────────────────────────────
    case "Initialized": {
      const d = decodeEventLog({ abi: [EVENT_ABI.Initialized], data, topics, strict: true });
      return {
        kind: "Initialized",
        ...base,
        version: Number(d.args.version),
      } satisfies Extract<AxiomEvent, { kind: "Initialized" }>;
    }
   }
 }

/** Run a single poll tick: fetch logs in `[fromBlock, fromBlock + window)`. */
export async function pollOnce(
  provider: JsonRpcProvider,
  watchList: readonly WatchedEvent[],
  fromBlock: bigint,
  window: bigint,
) {
  const toBlock = fromBlock + window - 1n;

  // One getLogs call per (event, address) pair. We could batch by contract
  // address using multiple topic0 OR'd together, but each individual call
  // is cheap and easier to error-isolate.
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

/** Sort logs by (blockNumber asc, logIndex asc). */
function logsByChainOrder(a: Log, b: Log) {
  if (a.blockNumber !== b.blockNumber) {
    return a.blockNumber < b.blockNumber ? -1 : 1;
  }
  if (a.index !== b.index) {
    return a.index < b.index ? -1 : 1;
  }
  return 0;
}

// ── Checkpoint persistence ─────────────────────────────────────────────

/** Load the persisted nextBlock cursor from disk. Returns null if unavailable. */
async function loadCheckpoint(): Promise<number | null> {
  try {
    const data = await readFile(CHECKPOINT_FILE, "utf-8");
    const parsed = JSON.parse(data);
    if (typeof parsed.nextBlock === "number" && Number.isInteger(parsed.nextBlock) && parsed.nextBlock > 0) {
      return parsed.nextBlock;
    }
  } catch {
    // File not found or invalid — return null
  }
  return null;
}

/** Atomically persist the nextBlock cursor (write to tmp, then rename). */
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

/** Class that holds state for a long-running watcher. */
export class Watcher {
  readonly provider: JsonRpcProvider;
  readonly watchList: readonly WatchedEvent[];
  readonly window: bigint;
  readonly intervalMs: number;
  readonly sink: EventSink;
  readonly logger: (line: Record<string, unknown>) => void;
  private nextBlock: bigint;
  private running = false;

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

  /** Return the next block the watcher will query (for checkpointing). */
  get cursor(): bigint {
    return this.nextBlock;
  }

  /** Start the polling loop. Returns a `{ stop }` handle. */
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

        // Pass the actual range size so `pollOnce`'s internal
        // `toBlock = fromBlock + window - 1n` resolves to our `toBlock`.
        const range = toBlock - fromBlock + 1n;
        const logs = await pollOnce(this.provider, this.watchList, fromBlock, range);
        logs.sort(logsByChainOrder);
        for (const log of logs) {
          const ev = decodeAxiomLog(log);
          if (ev === null) continue;
          await this.sink(ev);
        }
        this.nextBlock = toBlock + 1n;
        await saveCheckpoint(Number(this.nextBlock));
        this.logger({
          msg: "poll tick",
          fromBlock: fromBlock.toString(),
          toBlock: toBlock.toString(),
          latest: latest.toString(),
          nextBlock: this.nextBlock.toString(),
          logCount: logs.length,
        });
      } catch (err) {
        this.logger({
          level: "error",
          msg: "poll tick failed",
          err: err instanceof Error ? err.message : String(err),
        });
        // Back off a little on error to avoid hammering the RPC.
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, this.intervalMs);
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


