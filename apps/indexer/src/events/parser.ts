import type { Log } from "ethers";
import {
  decodeEventLog,
  getAddress,
  getEventSelector,
  type AbiEvent,
  type Address,
} from "viem";
import { validateHex, type Hex } from "@axiom/config/types/hex";
import { EVENT_NAMES } from "@axiom/config";

import {
  EVENT_ABI,
  type AxiomEvent,
  type EventName,
} from "../events.js";

export type EventTopicTable = { [K in EventName]: Hex };
export const TOPIC_TABLE: EventTopicTable = Object.fromEntries(
  (Object.keys(EVENT_ABI) as EventName[]).map((n) => [
    n,
    validateHex(getEventSelector(EVENT_ABI[n])),
  ]),
) as EventTopicTable;

export const TOPIC_TO_EVENT: Record<string, EventName> = {};
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
  Transfer: makeEventParser(EVENT_NAMES.Transfer, EVENT_ABI.Transfer, (a) => ({
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
  Deposited: makeEventParser(EVENT_NAMES.Deposited, EVENT_ABI.Deposited, (a) => ({
    tokenId: a["tokenId"] as bigint,
    from: getAddress(a["from"] as string),
    asset: getAddress(a["asset"] as string),
    amount: a["amount"] as bigint,
  })),
  Withdrawn: makeEventParser(EVENT_NAMES.Withdrawn, EVENT_ABI.Withdrawn, (a) => ({
    tokenId: a["tokenId"] as bigint,
    to: getAddress(a["to"] as string),
    asset: getAddress(a["asset"] as string),
    amount: a["amount"] as bigint,
  })),
  StrategySet: makeEventParser(EVENT_NAMES.StrategySet, EVENT_ABI.StrategySet, (a) => ({
    tokenId: a["tokenId"] as bigint,
    strategyRoot: a["strategyRoot"] as Hex,
    dailyLimit: a["dailyLimit"] as bigint,
    validUntilDay: a["validUntilDay"] as bigint,
  })),
  Executed: makeEventParser(EVENT_NAMES.Executed, EVENT_ABI.Executed, (a) => ({
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
