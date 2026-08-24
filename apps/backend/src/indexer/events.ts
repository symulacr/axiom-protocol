import { parseAbiItem, type AbiEvent, type Address } from "viem";
import {
  AGENT_NFT_ABI,
  PAYMENT_PROCESSOR_ABI,
  TEE_VERIFIER_ABI,
  VAULT_ABI,
} from "@axiom/config/abis";
import { BROADCAST_EVENT_NAMES } from "@axiom/config/constants";
import { resolveAddress } from "@axiom/config/addresses";

export type IndexerContractAddresses = {
  readonly AXIOM_AGENT_NFT: Address;
  readonly AXIOM_STRATEGY_VAULT: Address;
  readonly AXIOM_TEE_VERIFIER: Address;
  readonly AXIOM_PAYMENT_PROCESSOR: Address;
};

export function resolveIndexerAddresses(
  env: Record<string, unknown> = process.env as Record<string, unknown>,
): IndexerContractAddresses {
  // Only the four watched contracts; getAddresses() needs AXIOM_MOCK_USDC_ADDRESS (env-schema strips it), which broke local boot when all five resolved.
  return {
    AXIOM_AGENT_NFT: resolveAddress("agentNft", env),
    AXIOM_STRATEGY_VAULT: resolveAddress("strategyVault", env),
    AXIOM_TEE_VERIFIER: resolveAddress("teeVerifier", env),
    AXIOM_PAYMENT_PROCESSOR: resolveAddress("paymentProcessor", env),
  };
}

// Watched event -> canonical ABI in @axiom/config/abis; entries match deployed contracts (ERC1967 events stay literal).
const NFT = AGENT_NFT_ABI;
const VAULT = VAULT_ABI;
const PAY = PAYMENT_PROCESSOR_ABI;
const TEE = TEE_VERIFIER_ABI;

const EVENT_SOURCES = {
  Transfer: NFT,
  Updated: NFT,
  Authorization: NFT,
  AuthorizationRevoked: NFT,
  VerifierUpdated: NFT,
  CreatorSet: NFT,
  MintFeeUpdated: NFT,
  StorageInfoUpdated: NFT,
  PublishedSealedKey: NFT,
  DelegateAccess: NFT,
  Deposited: VAULT,
  Withdrawn: VAULT,
  StrategySet: VAULT,
  Executed: VAULT,
  PaymentProcessed: PAY,
  ComputeProviderPaid: PAY,
  EarningsWithdrawn: PAY,
  RoyaltySet: PAY,
  ProtocolTreasuryProposed: PAY,
  ProtocolTreasuryUpdated: PAY,
  ProtocolTreasuryProposalCancelled: PAY,
  ProtocolFeeBpsUpdated: PAY,
  PaymentTokenUpdated: PAY,
  MetadataJsonDecisionDocumented: NFT,
  Cloned: NFT,
  Upgraded: NFT,
  Initialized: NFT,
  SignerProposed: TEE,
  SignerExecuted: TEE,
  SignerProposalCancelled: TEE,
  AdminChanged:
    "event AdminChanged(address previousAdmin, address newAdmin)" as const,
  BeaconUpgraded: "event BeaconUpgraded(address indexed beacon)" as const,
} as const;

export type EventName = keyof typeof EVENT_SOURCES;

export const KNOWN_EVENT_NAMES = Object.keys(EVENT_SOURCES) as EventName[];
/** Names accepted on /v1/events: log-decoded events, server-appended
 * broadcast kinds (e.g. orchestrator "Tick" ticks), and the catch-all
 * "Unknown" store bucket. */
export const QUERYABLE_EVENT_NAMES = [
  ...KNOWN_EVENT_NAMES,
  ...Object.values(BROADCAST_EVENT_NAMES),
  "Unknown",
] as const;

function abiEventOf(
  name: EventName,
  source: readonly string[] | string,
): AbiEvent {
  const sig =
    typeof source === "string"
      ? source
      : source.find((e) => e.startsWith(`event ${name}(`));
  if (!sig) throw new Error(`@axiom/config/abis: missing event ${name}`);
  return parseAbiItem(sig) as AbiEvent;
}

export const EVENT_ABI = Object.fromEntries(
  (Object.keys(EVENT_SOURCES) as EventName[]).map((n) => [
    n,
    abiEventOf(n, EVENT_SOURCES[n]),
  ]),
) as { [K in EventName]: AbiEvent };

/** Envelope fields shared by every decoded event; variants list only their payload. */
interface EventEnvelope {
  blockNumber: number;
  txHash: string;
  logIndex: number;
}

export type AxiomEvent =
  | (EventEnvelope & {
      kind: "Transfer";
      from: string;
      to: string;
      tokenId: bigint;
    })
  | (EventEnvelope & {
      kind: "Updated";
      tokenId: bigint;
      oldDatasCount: number;
      newDatasCount: number;
    })
  | (EventEnvelope & {
      kind: "Authorization";
      tokenId: bigint;
      from: string;
      to: string;
    })
  | (EventEnvelope & {
      kind: "AuthorizationRevoked";
      tokenId: bigint;
      from: string;
      to: string;
    })
  | (EventEnvelope & {
      kind: "VerifierUpdated";
      oldVerifier: string;
      newVerifier: string;
    })
  | (EventEnvelope & { kind: "CreatorSet"; tokenId: bigint; creator: string })
  | (EventEnvelope & { kind: "MintFeeUpdated"; oldFee: bigint; newFee: bigint })
  | (EventEnvelope & {
      kind: "StorageInfoUpdated";
      oldInfo: string;
      newInfo: string;
    })
  | (EventEnvelope & {
      kind: "PublishedSealedKey";
      to: string;
      tokenId: bigint;
      sealedKeys: readonly string[];
    })
  | (EventEnvelope & {
      kind: "DelegateAccess";
      user: string;
      assistant: string;
    })
  | (EventEnvelope & {
      kind: "Deposited";
      tokenId: bigint;
      from: string;
      asset: string;
      amount: bigint;
    })
  | (EventEnvelope & {
      kind: "Withdrawn";
      tokenId: bigint;
      to: string;
      asset: string;
      amount: bigint;
    })
  | (EventEnvelope & {
      kind: "StrategySet";
      tokenId: bigint;
      strategyRoot: string;
      dailyLimit: bigint;
      validUntilDay: bigint;
    })
  | (EventEnvelope & {
      kind: "Executed";
      tokenId: bigint;
      actionHash: string;
      target: string;
      value: bigint;
      result: string;
    })
  | (EventEnvelope & {
      kind: "PaymentProcessed";
      agentTokenId: bigint;
      payer: string;
      creator: string;
      amount: bigint;
      creatorCut: bigint;
      protocolCut: bigint;
    })
  | (EventEnvelope & {
      kind: "ComputeProviderPaid";
      provider: string;
      amount: bigint;
    })
  | (EventEnvelope & {
      kind: "EarningsWithdrawn";
      creator: string;
      amount: bigint;
    })
  | (EventEnvelope & { kind: "RoyaltySet"; agentTokenId: bigint; bps: bigint })
  | (EventEnvelope & {
      kind: "ProtocolTreasuryProposed";
      proposedTreasury: string;
      effectiveAt: bigint;
    })
  | (EventEnvelope & {
      kind: "ProtocolTreasuryUpdated";
      oldTreasury: string;
      newTreasury: string;
    })
  | (EventEnvelope & {
      kind: "ProtocolTreasuryProposalCancelled";
      pendingTreasury: string;
    })
  | (EventEnvelope & {
      kind: "ProtocolFeeBpsUpdated";
      oldBps: bigint;
      newBps: bigint;
    })
  | (EventEnvelope & {
      kind: "PaymentTokenUpdated";
      oldToken: string;
      newToken: string;
    })
  | (EventEnvelope & {
      kind: "MetadataJsonDecisionDocumented";
      collectionName: string;
      collectionSymbol: string;
      rationaleTag: string;
    })
  | (EventEnvelope & {
      kind: "Cloned";
      tokenId: bigint;
      newTokenId: bigint;
      from: string;
      to: string;
    })
  | (EventEnvelope & {
      kind: "SignerProposed";
      newSigner: string;
      executableAt: bigint;
    })
  | (EventEnvelope & {
      kind: "SignerExecuted";
      oldSigner: string;
      newSigner: string;
    })
  | (EventEnvelope & {
      kind: "SignerProposalCancelled";
      cancelledSigner: string;
    })
  | (EventEnvelope & { kind: "Upgraded"; implementation: string })
  | (EventEnvelope & {
      kind: "AdminChanged";
      previousAdmin: string;
      newAdmin: string;
    })
  | (EventEnvelope & { kind: "BeaconUpgraded"; beacon: string })
  | (EventEnvelope & { kind: "Initialized"; version: number });
