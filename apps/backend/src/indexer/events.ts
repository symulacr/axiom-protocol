import { parseAbiItem, type AbiEvent, type Address } from "viem";
import {
  AGENT_NFT_ABI,
  PAYMENT_PROCESSOR_ABI,
  TEE_VERIFIER_ABI,
  VAULT_ABI,
} from "@axiom/config/abis";
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

// Watched event -> canonical ABI in @axiom/config/abis. Every entry matches the deployed
// contracts (wave-3 0g-stack deepdive §1); the old hand-written signatures mismatched 20 of 32
// topic0s and silently dropped those events in decodeAxiomLog. AdminChanged/BeaconUpgraded are
// ERC1967 proxy-infra events absent from the contract ABIs, so they stay as literals.
const EVENT_SOURCES = {
  Transfer: AGENT_NFT_ABI,
  Updated: AGENT_NFT_ABI,
  Authorization: AGENT_NFT_ABI,
  AuthorizationRevoked: AGENT_NFT_ABI,
  VerifierUpdated: AGENT_NFT_ABI,
  CreatorSet: AGENT_NFT_ABI,
  MintFeeUpdated: AGENT_NFT_ABI,
  StorageInfoUpdated: AGENT_NFT_ABI,
  PublishedSealedKey: AGENT_NFT_ABI,
  DelegateAccess: AGENT_NFT_ABI,
  Deposited: VAULT_ABI,
  Withdrawn: VAULT_ABI,
  StrategySet: VAULT_ABI,
  Executed: VAULT_ABI,
  PaymentProcessed: PAYMENT_PROCESSOR_ABI,
  ComputeProviderPaid: PAYMENT_PROCESSOR_ABI,
  EarningsWithdrawn: PAYMENT_PROCESSOR_ABI,
  RoyaltySet: PAYMENT_PROCESSOR_ABI,
  ProtocolTreasuryProposed: PAYMENT_PROCESSOR_ABI,
  ProtocolTreasuryUpdated: PAYMENT_PROCESSOR_ABI,
  ProtocolTreasuryProposalCancelled: PAYMENT_PROCESSOR_ABI,
  ProtocolFeeBpsUpdated: PAYMENT_PROCESSOR_ABI,
  PaymentTokenUpdated: PAYMENT_PROCESSOR_ABI,
  MetadataJsonDecisionDocumented: AGENT_NFT_ABI,
  Cloned: AGENT_NFT_ABI,
  SignerProposed: TEE_VERIFIER_ABI,
  SignerExecuted: TEE_VERIFIER_ABI,
  SignerProposalCancelled: TEE_VERIFIER_ABI,
  Upgraded: AGENT_NFT_ABI,
  AdminChanged:
    "event AdminChanged(address previousAdmin, address newAdmin)" as const,
  BeaconUpgraded: "event BeaconUpgraded(address indexed beacon)" as const,
  Initialized: AGENT_NFT_ABI,
} as const;

export type EventName = keyof typeof EVENT_SOURCES;

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

export type AxiomEvent =
  | {
      kind: "Transfer";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      from: string;
      to: string;
      tokenId: bigint;
    }
  | {
      kind: "Updated";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      tokenId: bigint;
      oldDatasCount: number;
      newDatasCount: number;
    }
  | {
      kind: "Authorization";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      tokenId: bigint;
      from: string;
      to: string;
    }
  | {
      kind: "AuthorizationRevoked";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      tokenId: bigint;
      from: string;
      to: string;
    }
  | {
      kind: "VerifierUpdated";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      oldVerifier: string;
      newVerifier: string;
    }
  | {
      kind: "CreatorSet";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      tokenId: bigint;
      creator: string;
    }
  | {
      kind: "MintFeeUpdated";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      oldFee: bigint;
      newFee: bigint;
    }
  | {
      kind: "StorageInfoUpdated";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      oldInfo: string;
      newInfo: string;
    }
  | {
      kind: "PublishedSealedKey";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      to: string;
      tokenId: bigint;
      sealedKeys: readonly string[];
    }
  | {
      kind: "DelegateAccess";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      user: string;
      assistant: string;
    }
  | {
      kind: "Deposited";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      tokenId: bigint;
      from: string;
      asset: string;
      amount: bigint;
    }
  | {
      kind: "Withdrawn";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      tokenId: bigint;
      to: string;
      asset: string;
      amount: bigint;
    }
  | {
      kind: "StrategySet";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      tokenId: bigint;
      strategyRoot: string;
      dailyLimit: bigint;
      validUntilDay: bigint;
    }
  | {
      kind: "Executed";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      tokenId: bigint;
      actionHash: string;
      target: string;
      value: bigint;
      result: string;
    }
  | {
      kind: "PaymentProcessed";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      agentTokenId: bigint;
      payer: string;
      creator: string;
      amount: bigint;
      creatorCut: bigint;
      protocolCut: bigint;
    }
  | {
      kind: "ComputeProviderPaid";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      provider: string;
      amount: bigint;
    }
  | {
      kind: "EarningsWithdrawn";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      creator: string;
      amount: bigint;
    }
  | {
      kind: "RoyaltySet";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      agentTokenId: bigint;
      bps: bigint;
    }
  | {
      kind: "ProtocolTreasuryProposed";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      proposedTreasury: string;
      effectiveAt: bigint;
    }
  | {
      kind: "ProtocolTreasuryUpdated";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      oldTreasury: string;
      newTreasury: string;
    }
  | {
      kind: "ProtocolTreasuryProposalCancelled";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      pendingTreasury: string;
    }
  | {
      kind: "ProtocolFeeBpsUpdated";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      oldBps: bigint;
      newBps: bigint;
    }
  | {
      kind: "PaymentTokenUpdated";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      oldToken: string;
      newToken: string;
    }
  | {
      kind: "MetadataJsonDecisionDocumented";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      collectionName: string;
      collectionSymbol: string;
      rationaleTag: string;
    }
  | {
      kind: "Cloned";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      tokenId: bigint;
      newTokenId: bigint;
      from: string;
      to: string;
    }
  | {
      kind: "SignerProposed";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      newSigner: string;
      executableAt: bigint;
    }
  | {
      kind: "SignerExecuted";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      oldSigner: string;
      newSigner: string;
    }
  | {
      kind: "SignerProposalCancelled";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      cancelledSigner: string;
    }
  | {
      kind: "Upgraded";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      implementation: string;
    }
  | {
      kind: "AdminChanged";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      previousAdmin: string;
      newAdmin: string;
    }
  | {
      kind: "BeaconUpgraded";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      beacon: string;
    }
  | {
      kind: "Initialized";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      version: number;
    };
