import type { Log } from "ethers";
import {
  decodeEventLog,
  getAddress,
  getEventSelector,
  type AbiEvent,
  type Address,
} from "viem";
import { validateHex, type Hex } from "@axiom/config/types/hex";

import { EVENT_ABI, type AxiomEvent, type EventName } from "../events.js";

type EventTopicTable = { [K in EventName]: Hex };
export const TOPIC_TABLE: EventTopicTable = Object.fromEntries(
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

type BaseFields = {
  blockNumber: number;
  txHash: `0x${string}`;
  logIndex: number;
};

type EventParser = (log: Log, base: BaseFields) => AxiomEvent | null;

function makeEventParser(
  kind: EventName,
  extract: (args: Record<string, unknown>) => Record<string, unknown>,
): EventParser {
  const abi: AbiEvent = EVENT_ABI[kind];
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

const p = makeEventParser;
const addr = (v: unknown): string => getAddress(v as string);

// Authorization and AuthorizationRevoked share the (tokenId, from, to) shape.
const authFields = (a: Record<string, unknown>) => ({
  tokenId: a["tokenId"] as bigint,
  from: addr(a["from"]),
  to: addr(a["to"]),
});

const EVENT_PARSERS: Record<string, EventParser> = {
  Transfer: p("Transfer", (a) => ({
    from: addr(a["from"]),
    to: addr(a["to"]),
    tokenId: a["tokenId"] as bigint,
  })),
  Updated: p("Updated", (a) => ({
    tokenId: a["tokenId"] as bigint,
    oldDatasCount: (a["oldDatas"] as unknown[]).length,
    newDatasCount: (a["newDatas"] as unknown[]).length,
  })),
  Authorization: p("Authorization", authFields),
  AuthorizationRevoked: p("AuthorizationRevoked", authFields),
  VerifierUpdated: p("VerifierUpdated", (a) => ({
    oldVerifier: addr(a["oldVerifier"]),
    newVerifier: addr(a["newVerifier"]),
  })),
  CreatorSet: p("CreatorSet", (a) => ({
    tokenId: a["tokenId"] as bigint,
    creator: addr(a["creator"]),
  })),
  MintFeeUpdated: p("MintFeeUpdated", (a) => ({
    oldFee: a["oldFee"] as bigint,
    newFee: a["newFee"] as bigint,
  })),
  StorageInfoUpdated: p("StorageInfoUpdated", (a) => ({
    oldInfo: a["oldInfo"] as string,
    newInfo: a["newInfo"] as string,
  })),
  PublishedSealedKey: p("PublishedSealedKey", (a) => ({
    to: addr(a["to"]),
    tokenId: a["tokenId"] as bigint,
    sealedKeys: a["sealedKeys"] as readonly Hex[],
  })),
  DelegateAccess: p("DelegateAccess", (a) => ({
    user: addr(a["user"]),
    assistant: addr(a["assistant"]),
  })),
  Deposited: p("Deposited", (a) => ({
    tokenId: a["tokenId"] as bigint,
    from: addr(a["from"]),
    asset: addr(a["asset"]),
    amount: a["amount"] as bigint,
  })),
  Withdrawn: p("Withdrawn", (a) => ({
    tokenId: a["tokenId"] as bigint,
    to: addr(a["to"]),
    asset: addr(a["asset"]),
    amount: a["amount"] as bigint,
  })),
  StrategySet: p("StrategySet", (a) => ({
    tokenId: a["tokenId"] as bigint,
    strategyRoot: a["strategyRoot"] as Hex,
    dailyLimit: a["dailyLimit"] as bigint,
    validUntilDay: a["validUntilDay"] as bigint,
  })),
  Executed: p("Executed", (a) => ({
    tokenId: a["tokenId"] as bigint,
    actionHash: a["actionHash"] as Hex,
    target: addr(a["target"]),
    value: a["value"] as bigint,
    result: a["result"] as Hex,
  })),
  PaymentProcessed: p("PaymentProcessed", (a) => ({
    agentTokenId: a["agentTokenId"] as bigint,
    payer: addr(a["payer"]),
    creator: addr(a["creator"]),
    amount: a["amount"] as bigint,
    creatorCut: a["creatorCut"] as bigint,
    protocolCut: a["protocolCut"] as bigint,
  })),
  ComputeProviderPaid: p("ComputeProviderPaid", (a) => ({
    provider: addr(a["provider"]),
    amount: a["amount"] as bigint,
  })),
  EarningsWithdrawn: p("EarningsWithdrawn", (a) => ({
    creator: addr(a["creator"]),
    amount: a["amount"] as bigint,
  })),
  RoyaltySet: p("RoyaltySet", (a) => ({
    agentTokenId: a["agentTokenId"] as bigint,
    bps: a["bps"] as bigint,
  })),
  ProtocolTreasuryProposed: p("ProtocolTreasuryProposed", (a) => ({
    proposedTreasury: addr(a["proposedTreasury"]),
    effectiveAt: a["effectiveAt"] as bigint,
  })),
  ProtocolTreasuryUpdated: p("ProtocolTreasuryUpdated", (a) => ({
    oldTreasury: addr(a["oldTreasury"]),
    newTreasury: addr(a["newTreasury"]),
  })),
  ProtocolTreasuryProposalCancelled: p(
    "ProtocolTreasuryProposalCancelled",
    (a) => ({ pendingTreasury: addr(a["pendingTreasury"]) }),
  ),
  ProtocolFeeBpsUpdated: p("ProtocolFeeBpsUpdated", (a) => ({
    oldBps: a["oldBps"] as bigint,
    newBps: a["newBps"] as bigint,
  })),
  PaymentTokenUpdated: p("PaymentTokenUpdated", (a) => ({
    oldToken: addr(a["oldToken"]),
    newToken: addr(a["newToken"]),
  })),
  Cloned: p("Cloned", (a) => ({
    tokenId: a["tokenId"] as bigint,
    newTokenId: a["newTokenId"] as bigint,
    from: addr(a["from"]),
    to: addr(a["to"]),
  })),
  MetadataJsonDecisionDocumented: p("MetadataJsonDecisionDocumented", (a) => ({
    collectionName: a["collectionName"] as string,
    collectionSymbol: a["collectionSymbol"] as string,
    rationaleTag: a["rationaleTag"] as string,
  })),
  SignerProposed: p("SignerProposed", (a) => ({
    newSigner: addr(a["newSigner"]),
    executableAt: a["executableAt"] as bigint,
  })),
  SignerExecuted: p("SignerExecuted", (a) => ({
    oldSigner: addr(a["oldSigner"]),
    newSigner: addr(a["newSigner"]),
  })),
  SignerProposalCancelled: p("SignerProposalCancelled", (a) => ({
    cancelledSigner: addr(a["cancelledSigner"]),
  })),
  Upgraded: p("Upgraded", (a) => ({
    implementation: addr(a["implementation"]),
  })),
  AdminChanged: p("AdminChanged", (a) => ({
    previousAdmin: addr(a["previousAdmin"]),
    newAdmin: addr(a["newAdmin"]),
  })),
  BeaconUpgraded: p("BeaconUpgraded", (a) => ({ beacon: addr(a["beacon"]) })),
  Initialized: p("Initialized", (a) => ({ version: Number(a["version"]) })),
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
