import { parseAbiItem, type AbiEvent, type Address, type Hex } from "viem";
import { toViemHex } from "@axiom/config/types/hex";
import { DEPLOYED_ADDRESSES } from "@axiom/config/addresses";

/**
 * Lowercase contract addresses (used for `getLogs({ address })` filters).
 * Derived from the canonical config to avoid duplication.
 */
export const ADDRESSES = {
  AXIOM_AGENT_NFT: toViemHex(DEPLOYED_ADDRESSES.agentNft),
  AXIOM_STRATEGY_VAULT: toViemHex(DEPLOYED_ADDRESSES.strategyVault),
  AXIOM_TEE_VERIFIER: toViemHex(DEPLOYED_ADDRESSES.teeVerifier),
  AXIOM_PAYMENT_PROCESSOR: toViemHex(DEPLOYED_ADDRESSES.paymentProcessor),
} as const;

/**
 * Solidity event ABI strings as written in the contracts.
 * These are passed to viem's `parseAbiItem` / `keccak256` to derive topic-0.
 */
export const EVENT_SIGNATURES = {
  // ── AxiomAgentNFT (ERC-721 inherited) ──────────────────────────────
  Transfer:
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)" as const,

  // ── AxiomAgentNFT (ERC-7857 IDataStorage extension) ────────────────
  // Canonical signature without tuple syntax (viem's human-readable parser
  // does not accept inline `tuple(...)`); the JSON AbiEvent is in `EVENT_ABI.Updated`.
  Updated: "Updated(uint256,(string,bytes32)[],(string,bytes32)[])" as const,
  Authorization:
    "event Authorization(uint256 indexed tokenId, address indexed from, address indexed to)" as const,
  AuthorizationRevoked:
    "event AuthorizationRevoked(uint256 indexed tokenId, address indexed from, address indexed to)" as const,

  // ── AxiomAgentNFT (local) ──────────────────────────────────────────
  VerifierUpdated:
    "event VerifierUpdated(address indexed oldVerifier, address indexed newVerifier)" as const,
  CreatorSet: "event CreatorSet(uint256 indexed tokenId, address indexed creator)" as const,
  MintFeeUpdated: "event MintFeeUpdated(uint256 oldFee, uint256 newFee)" as const,
  StorageInfoUpdated: "event StorageInfoUpdated(string oldInfo, string newInfo)" as const,

  // ── ERC-7857 base ──────────────────────────────────────────────────
  PublishedSealedKey:
    "event PublishedSealedKey(address indexed to, uint256 indexed tokenId, bytes[] sealedKeys)" as const,
  DelegateAccess: "event DelegateAccess(address indexed user, address indexed assistant)" as const,

  // ── AxiomStrategyVault ─────────────────────────────────────────────
  Deposited:
    "event Deposited(uint256 indexed tokenId, address indexed from, address indexed asset, uint256 amount)" as const,
  Withdrawn:
    "event Withdrawn(uint256 indexed tokenId, address indexed to, address indexed asset, uint256 amount)" as const,
  StrategySet:
    "event StrategySet(uint256 indexed tokenId, bytes32 strategyRoot, uint256 dailyLimit, uint64 validUntilDay)" as const,
  Executed:
    "event Executed(uint256 indexed tokenId, bytes32 indexed actionHash, address indexed target, uint256 value, bytes result)" as const,
  RegistryUpdated: "event RegistryUpdated(address indexed nft)" as const,

  // ── AxiomPaymentProcessor ─────────────────────────────────────────
  PaymentProcessed:
    "event PaymentProcessed(uint256 indexed agentTokenId, address indexed payer, address indexed creator, uint256 amount, uint256 creatorCut, uint256 protocolCut)" as const,
  ComputeProviderPaid:
    "event ComputeProviderPaid(address indexed provider, uint256 amount)" as const,
  EarningsWithdrawn:
    "event EarningsWithdrawn(address indexed creator, uint256 amount)" as const,
  RoyaltySet: "event RoyaltySet(uint256 indexed agentTokenId, uint256 bps)" as const,
  ProtocolTreasuryUpdated:
    "event ProtocolTreasuryUpdated(address indexed oldTreasury, address indexed newTreasury)" as const,
  ProtocolFeeBpsUpdated:
    "event ProtocolFeeBpsUpdated(uint256 oldBps, uint256 newBps)" as const,
  PaymentTokenUpdated:
    "event PaymentTokenUpdated(address indexed oldToken, address indexed newToken)" as const,

  // ── ERC7857Cloneable ──────────────────────────────────────────────
  Cloned:
    "event Cloned(uint256 indexed tokenId, uint256 indexed newTokenId, address from, address to)" as const,

  // ── AxiomAgentNFT (metadata decision) ─────────────────────────────
  MetadataJsonDecisionDocumented:
    "event MetadataJsonDecisionDocumented(string collectionName, string collectionSymbol, string rationaleTag)" as const,

  // ── AxiomTeeVerifier ──────────────────────────────────────────────
  SignerRegistered:
    "event SignerRegistered(address indexed oldSigner, address indexed newSigner)" as const,

  // ── ERC-1967 Proxy events (emitted by the ERC1967Proxy at AXIOM_AGENT_NFT address) ──
  Upgraded:
    "event Upgraded(address indexed implementation)" as const,
  AdminChanged:
    "event AdminChanged(address previousAdmin, address newAdmin)" as const,
  BeaconUpgraded:
    "event BeaconUpgraded(address indexed beacon)" as const,

  // ── OpenZeppelin Initializable ────────────────────────────────────
  // uint64 matches OZ v5 (v4 used uint8).
  Initialized:
    "event Initialized(uint64 version)" as const,
 } as const;

/** Type alias for any event name defined above. */
export type EventName = keyof typeof EVENT_SIGNATURES;

/** Decoded event objects. The `kind` discriminator is sufficient on its own. */
export type AxiomEvent =
  // ERC-721
  | { kind: "Transfer"; blockNumber: number; txHash: Hex; logIndex: number; from: Address; to: Address; tokenId: bigint }
  // ERC-7857 IDataStorage
  | { kind: "Updated"; blockNumber: number; txHash: Hex; logIndex: number; tokenId: bigint; oldDatasCount: number; newDatasCount: number }
  // ERC-7857 Authorize
  | { kind: "Authorization"; blockNumber: number; txHash: Hex; logIndex: number; tokenId: bigint; from: Address; to: Address }
  | { kind: "AuthorizationRevoked"; blockNumber: number; txHash: Hex; logIndex: number; tokenId: bigint; from: Address; to: Address }
  // AxiomAgentNFT (local)
  | { kind: "VerifierUpdated"; blockNumber: number; txHash: Hex; logIndex: number; oldVerifier: Address; newVerifier: Address }
  | { kind: "CreatorSet"; blockNumber: number; txHash: Hex; logIndex: number; tokenId: bigint; creator: Address }
  | { kind: "MintFeeUpdated"; blockNumber: number; txHash: Hex; logIndex: number; oldFee: bigint; newFee: bigint }
  | { kind: "StorageInfoUpdated"; blockNumber: number; txHash: Hex; logIndex: number; oldInfo: string; newInfo: string }
  // ERC-7857 base
  | { kind: "PublishedSealedKey"; blockNumber: number; txHash: Hex; logIndex: number; to: Address; tokenId: bigint; sealedKeys: readonly Hex[] }
  | { kind: "DelegateAccess"; blockNumber: number; txHash: Hex; logIndex: number; user: Address; assistant: Address }
  // AxiomStrategyVault
  | { kind: "Deposited"; blockNumber: number; txHash: Hex; logIndex: number; tokenId: bigint; from: Address; asset: Address; amount: bigint }
  | { kind: "Withdrawn"; blockNumber: number; txHash: Hex; logIndex: number; tokenId: bigint; to: Address; asset: Address; amount: bigint }
  | { kind: "StrategySet"; blockNumber: number; txHash: Hex; logIndex: number; tokenId: bigint; strategyRoot: Hex; dailyLimit: bigint; validUntilDay: bigint }
  | { kind: "Executed"; blockNumber: number; txHash: Hex; logIndex: number; tokenId: bigint; actionHash: Hex; target: Address; value: bigint; result: Hex }
  | { kind: "RegistryUpdated"; blockNumber: number; txHash: Hex; logIndex: number; nft: Address }
  // AxiomPaymentProcessor
  | { kind: "PaymentProcessed"; blockNumber: number; txHash: Hex; logIndex: number; agentTokenId: bigint; payer: Address; creator: Address; amount: bigint; creatorCut: bigint; protocolCut: bigint }
  | { kind: "ComputeProviderPaid"; blockNumber: number; txHash: Hex; logIndex: number; provider: Address; amount: bigint }
  | { kind: "EarningsWithdrawn"; blockNumber: number; txHash: Hex; logIndex: number; creator: Address; amount: bigint }
  | { kind: "RoyaltySet"; blockNumber: number; txHash: Hex; logIndex: number; agentTokenId: bigint; bps: bigint }
  | { kind: "ProtocolTreasuryUpdated"; blockNumber: number; txHash: Hex; logIndex: number; oldTreasury: Address; newTreasury: Address }
  | { kind: "ProtocolFeeBpsUpdated"; blockNumber: number; txHash: Hex; logIndex: number; oldBps: bigint; newBps: bigint }
  | { kind: "PaymentTokenUpdated"; blockNumber: number; txHash: Hex; logIndex: number; oldToken: Address; newToken: Address }
  // ERC7857Cloneable
  | { kind: "Cloned"; blockNumber: number; txHash: Hex; logIndex: number; tokenId: bigint; newTokenId: bigint; from: Address; to: Address }
  // AxiomAgentNFT (metadata decision)
  | { kind: "MetadataJsonDecisionDocumented"; blockNumber: number; txHash: Hex; logIndex: number; collectionName: string; collectionSymbol: string; rationaleTag: string }
  // AxiomTeeVerifier
  | { kind: "SignerRegistered"; blockNumber: number; txHash: Hex; logIndex: number; oldSigner: Address; newSigner: Address }
  // ERC-1967 proxy events (emitted by the ERC1967Proxy)
  | { kind: "Upgraded"; blockNumber: number; txHash: Hex; logIndex: number; implementation: Address }
  | { kind: "AdminChanged"; blockNumber: number; txHash: Hex; logIndex: number; previousAdmin: Address; newAdmin: Address }
  | { kind: "BeaconUpgraded"; blockNumber: number; txHash: Hex; logIndex: number; beacon: Address }
  // OpenZeppelin Initializable
  | { kind: "Initialized"; blockNumber: number; txHash: Hex; logIndex: number; version: number };

/** viem `AbiEvent` table for the events we subscribe to, keyed by event name. */
export type EventAbiTable = {
  [K in EventName]: AbiEvent;
};

/** Per-event `AbiEvent` items, built at module load. */
export const EVENT_ABI = {
  Transfer: parseAbiItem(EVENT_SIGNATURES.Transfer),
  Updated: {
    type: "event",
    name: "Updated",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      {
        name: "oldDatas",
        type: "tuple[]",
        components: [
          { name: "dataDescription", type: "string" },
          { name: "dataHash", type: "bytes32" },
        ],
      },
      {
        name: "newDatas",
        type: "tuple[]",
        components: [
          { name: "dataDescription", type: "string" },
          { name: "dataHash", type: "bytes32" },
        ],
      },
    ],
  },
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
  RegistryUpdated: parseAbiItem(EVENT_SIGNATURES.RegistryUpdated),

  // AxiomPaymentProcessor
  PaymentProcessed: parseAbiItem(EVENT_SIGNATURES.PaymentProcessed),
  ComputeProviderPaid: parseAbiItem(EVENT_SIGNATURES.ComputeProviderPaid),
  EarningsWithdrawn: parseAbiItem(EVENT_SIGNATURES.EarningsWithdrawn),
  RoyaltySet: parseAbiItem(EVENT_SIGNATURES.RoyaltySet),
  ProtocolTreasuryUpdated: parseAbiItem(EVENT_SIGNATURES.ProtocolTreasuryUpdated),
  ProtocolFeeBpsUpdated: parseAbiItem(EVENT_SIGNATURES.ProtocolFeeBpsUpdated),
  PaymentTokenUpdated: parseAbiItem(EVENT_SIGNATURES.PaymentTokenUpdated),

  // ERC7857Cloneable / AxiomAgentNFT metadata / AxiomTeeVerifier
  Cloned: parseAbiItem(EVENT_SIGNATURES.Cloned),
  MetadataJsonDecisionDocumented: parseAbiItem(EVENT_SIGNATURES.MetadataJsonDecisionDocumented),
  SignerRegistered: parseAbiItem(EVENT_SIGNATURES.SignerRegistered),

  // ERC-1967 proxy events
  Upgraded: parseAbiItem(EVENT_SIGNATURES.Upgraded),
  AdminChanged: parseAbiItem(EVENT_SIGNATURES.AdminChanged),
  BeaconUpgraded: parseAbiItem(EVENT_SIGNATURES.BeaconUpgraded),
  // OpenZeppelin Initializable
  Initialized: parseAbiItem(EVENT_SIGNATURES.Initialized),
 } as const satisfies EventAbiTable;
