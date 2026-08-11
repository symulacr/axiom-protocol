import { parseAbiItem, type AbiEvent, type Address } from "viem";
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

const EVENT_SIGNATURES = {
  Transfer:
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)" as const,
  Updated: "event Updated(uint256 indexed tokenId, string uri)" as const,
  Authorization:
    "event Authorization(address indexed user, address indexed operator, address indexed controller, uint256 indexed tokenId, uint256 expiresAt)" as const,
  AuthorizationRevoked:
    "event AuthorizationRevoked(address indexed user, address indexed operator, address indexed controller, uint256 indexed tokenId)" as const,
  VerifierUpdated:
    "event VerifierUpdated(address indexed oldVerifier, address indexed newVerifier)" as const,
  CreatorSet:
    "event CreatorSet(address indexed creator, address indexed agent, uint256 indexed tokenId)" as const,
  MintFeeUpdated:
    "event MintFeeUpdated(address indexed token, uint256 oldFee, uint256 newFee)" as const,
  StorageInfoUpdated:
    "event StorageInfoUpdated(uint256 indexed tokenId, string blobHash, uint256 blobSize)" as const,
  PublishedSealedKey:
    "event PublishedSealedKey(uint256 indexed tokenId, bytes sealedKey, uint256 version)" as const,
  DelegateAccess:
    "event DelegateAccess(uint256 indexed tokenId, address indexed delegate, bytes permission)" as const,
  Deposited:
    "event Deposited(address indexed user, uint256 indexed tokenId, address indexed strategy, uint256 amount, uint256 shares)" as const,
  Withdrawn:
    "event Withdrawn(address indexed user, uint256 indexed tokenId, address indexed strategy, uint256 amount, uint256 shares)" as const,
  StrategySet:
    "event StrategySet(uint256 indexed tokenId, address indexed strategy, bytes params)" as const,
  Executed:
    "event Executed(uint256 indexed tokenId, bytes data, bytes response)" as const,
  PaymentProcessed:
    "event PaymentProcessed(uint256 indexed tokenId, address indexed payer, address indexed payee, uint256 amount, address token)" as const,
  ComputeProviderPaid:
    "event ComputeProviderPaid(uint256 indexed tokenId, address indexed provider, address indexed payer, uint256 amount, address token, bytes metadata)" as const,
  EarningsWithdrawn:
    "event EarningsWithdrawn(uint256 indexed tokenId, address indexed user, address indexed token, uint256 amount)" as const,
  RoyaltySet:
    "event RoyaltySet(uint256 indexed tokenId, address indexed receiver, uint96 feeNumerator)" as const,
  ProtocolTreasuryProposed:
    "event ProtocolTreasuryProposed(address indexed newTreasury)" as const,
  ProtocolTreasuryUpdated:
    "event ProtocolTreasuryUpdated(address indexed oldTreasury, address indexed newTreasury)" as const,
  ProtocolTreasuryProposalCancelled:
    "event ProtocolTreasuryProposalCancelled(address indexed proposedTreasury)" as const,
  ProtocolFeeBpsUpdated:
    "event ProtocolFeeBpsUpdated(uint16 oldFeeBps, uint16 newFeeBps)" as const,
  PaymentTokenUpdated:
    "event PaymentTokenUpdated(address indexed oldToken, address indexed newToken)" as const,
  MetadataJsonDecisionDocumented:
    "event MetadataJsonDecisionDocumented(uint256 indexed tokenId, bytes32 hash, address indexed author)" as const,
  Cloned:
    "event Cloned(address indexed implementation, address indexed clone)" as const,
  SignerProposed: "event SignerProposed(address indexed signer)" as const,
  SignerExecuted: "event SignerExecuted(address indexed signer)" as const,
  SignerProposalCancelled:
    "event SignerProposalCancelled(address indexed signer)" as const,
  Upgraded: "event Upgraded(address indexed implementation)" as const,
  AdminChanged:
    "event AdminChanged(address previousAdmin, address newAdmin)" as const,
  BeaconUpgraded: "event BeaconUpgraded(address indexed beacon)" as const,
  Initialized: "event Initialized(uint8 version)" as const,
} as const;

export type EventName = keyof typeof EVENT_SIGNATURES;

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
      uri: string;
    }
  | {
      kind: "Authorization";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      user: string;
      operator: string;
      controller: string;
      tokenId: bigint;
      expiresAt: bigint;
    }
  | {
      kind: "AuthorizationRevoked";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      user: string;
      operator: string;
      controller: string;
      tokenId: bigint;
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
      creator: string;
      agent: string;
      tokenId: bigint;
    }
  | {
      kind: "MintFeeUpdated";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      token: string;
      oldFee: bigint;
      newFee: bigint;
    }
  | {
      kind: "StorageInfoUpdated";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      tokenId: bigint;
      blobHash: string;
      blobSize: bigint;
    }
  | {
      kind: "PublishedSealedKey";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      tokenId: bigint;
      sealedKey: string;
      version: bigint;
    }
  | {
      kind: "DelegateAccess";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      tokenId: bigint;
      delegate: string;
      permission: string;
    }
  | {
      kind: "Deposited";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      user: string;
      tokenId: bigint;
      strategy: string;
      amount: bigint;
      shares: bigint;
    }
  | {
      kind: "Withdrawn";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      user: string;
      tokenId: bigint;
      strategy: string;
      amount: bigint;
      shares: bigint;
    }
  | {
      kind: "StrategySet";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      tokenId: bigint;
      strategy: string;
      params: string;
    }
  | {
      kind: "Executed";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      tokenId: bigint;
      data: string;
      response: string;
    }
  | {
      kind: "PaymentProcessed";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      tokenId: bigint;
      payer: string;
      payee: string;
      amount: bigint;
      token: string;
    }
  | {
      kind: "ComputeProviderPaid";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      tokenId: bigint;
      provider: string;
      payer: string;
      amount: bigint;
      token: string;
      metadata: string;
    }
  | {
      kind: "EarningsWithdrawn";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      tokenId: bigint;
      user: string;
      token: string;
      amount: bigint;
    }
  | {
      kind: "RoyaltySet";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      tokenId: bigint;
      receiver: string;
      feeNumerator: number;
    }
  | {
      kind: "ProtocolTreasuryProposed";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      newTreasury: string;
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
      proposedTreasury: string;
    }
  | {
      kind: "ProtocolFeeBpsUpdated";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      oldFeeBps: number;
      newFeeBps: number;
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
      tokenId: bigint;
      hash: string;
      author: string;
    }
  | {
      kind: "Cloned";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      implementation: string;
      clone: string;
    }
  | {
      kind: "SignerProposed";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      signer: string;
    }
  | {
      kind: "SignerExecuted";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      signer: string;
    }
  | {
      kind: "SignerProposalCancelled";
      blockNumber: number;
      txHash: string;
      logIndex: number;
      signer: string;
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

type EventAbiTable = {
  [K in EventName]: AbiEvent;
};

export const EVENT_ABI = {
  Transfer: parseAbiItem(EVENT_SIGNATURES.Transfer),
  Updated: parseAbiItem(EVENT_SIGNATURES.Updated),
  Authorization: parseAbiItem(EVENT_SIGNATURES.Authorization),
  AuthorizationRevoked: parseAbiItem(EVENT_SIGNATURES.AuthorizationRevoked),
  VerifierUpdated: parseAbiItem(EVENT_SIGNATURES.VerifierUpdated),
  CreatorSet: parseAbiItem(EVENT_SIGNATURES.CreatorSet),
  MintFeeUpdated: parseAbiItem(EVENT_SIGNATURES.MintFeeUpdated),
  StorageInfoUpdated: parseAbiItem(EVENT_SIGNATURES.StorageInfoUpdated),
  PublishedSealedKey: parseAbiItem(EVENT_SIGNATURES.PublishedSealedKey),
  DelegateAccess: parseAbiItem(EVENT_SIGNATURES.DelegateAccess),
  Deposited: parseAbiItem(EVENT_SIGNATURES.Deposited),
  Withdrawn: parseAbiItem(EVENT_SIGNATURES.Withdrawn),
  StrategySet: parseAbiItem(EVENT_SIGNATURES.StrategySet),
  Executed: parseAbiItem(EVENT_SIGNATURES.Executed),
  PaymentProcessed: parseAbiItem(EVENT_SIGNATURES.PaymentProcessed),
  ComputeProviderPaid: parseAbiItem(EVENT_SIGNATURES.ComputeProviderPaid),
  EarningsWithdrawn: parseAbiItem(EVENT_SIGNATURES.EarningsWithdrawn),
  RoyaltySet: parseAbiItem(EVENT_SIGNATURES.RoyaltySet),
  ProtocolTreasuryProposed: parseAbiItem(
    EVENT_SIGNATURES.ProtocolTreasuryProposed,
  ),
  ProtocolTreasuryUpdated: parseAbiItem(
    EVENT_SIGNATURES.ProtocolTreasuryUpdated,
  ),
  ProtocolTreasuryProposalCancelled: parseAbiItem(
    EVENT_SIGNATURES.ProtocolTreasuryProposalCancelled,
  ),
  ProtocolFeeBpsUpdated: parseAbiItem(EVENT_SIGNATURES.ProtocolFeeBpsUpdated),
  PaymentTokenUpdated: parseAbiItem(EVENT_SIGNATURES.PaymentTokenUpdated),
  MetadataJsonDecisionDocumented: parseAbiItem(
    EVENT_SIGNATURES.MetadataJsonDecisionDocumented,
  ),
  Cloned: parseAbiItem(EVENT_SIGNATURES.Cloned),
  SignerProposed: parseAbiItem(EVENT_SIGNATURES.SignerProposed),
  SignerExecuted: parseAbiItem(EVENT_SIGNATURES.SignerExecuted),
  SignerProposalCancelled: parseAbiItem(
    EVENT_SIGNATURES.SignerProposalCancelled,
  ),
  Upgraded: parseAbiItem(EVENT_SIGNATURES.Upgraded),
  AdminChanged: parseAbiItem(EVENT_SIGNATURES.AdminChanged),
  BeaconUpgraded: parseAbiItem(EVENT_SIGNATURES.BeaconUpgraded),
  Initialized: parseAbiItem(EVENT_SIGNATURES.Initialized),
} as const satisfies EventAbiTable;
