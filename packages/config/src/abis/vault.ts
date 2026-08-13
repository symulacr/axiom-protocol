export const VAULT_ABI = [
  "function balanceOf(uint256 tokenId) view returns (uint256)",
  "function deposit(uint256 tokenId) payable",
  "function execute(uint256 tokenId, address target, uint256 value, bytes data, bytes32[] merkleProof) returns (bytes)",
  "function initialize(address _nft, address _owner)",
  "function nft() view returns (address)",
  "function owner() view returns (address)",
  "function pause()",
  "function paused() view returns (bool)",
  "function recoverExcessNative(address to)",
  "function renounceOwnership()",
  "function setStrategy(uint256 tokenId, bytes32 root, uint256 dailyLimit, uint64 validUntilDay)",
  "function strategyOf(uint256 tokenId) view returns (bytes32 root, uint256 dailyLimit, uint256 dailySpent, uint64 resetDay, uint64 validUntilDay)",
  "function totalTrackedBalance() view returns (uint256)",
  "function transferOwnership(address newOwner)",
  "function unpause()",
  "function usedActions(uint256, bytes32) view returns (bool)",
  "function vaults(uint256) view returns (uint256 balance, bytes32 strategyRoot, uint128 dailyLimit, uint128 dailySpent, uint64 resetDay, uint64 validUntilDay)",
  "function withdraw(uint256 tokenId, uint256 amount)",
  "event Deposited(uint256 indexed tokenId, address indexed from, address indexed asset, uint256 amount)",
  "event Executed(uint256 indexed tokenId, bytes32 indexed actionHash, address indexed target, uint256 value, bytes result)",
  "event Initialized(uint64 version)",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "event Paused(address account)",
  "event StrategySet(uint256 indexed tokenId, bytes32 strategyRoot, uint256 dailyLimit, uint64 validUntilDay)",
  "event Unpaused(address account)",
  "event Withdrawn(uint256 indexed tokenId, address indexed to, address indexed asset, uint256 amount)",
  "error ActionAlreadyUsed()",
  "error AddressEmptyCode(address target)",
  "error CallFailed()",
  "error DailyLimitExceeded()",
  "error ERC1967InvalidImplementation(address implementation)",
  "error ERC1967NonPayable()",
  "error EnforcedPause()",
  "error ExpectedPause()",
  "error FailedInnerCall()",
  "error InvalidInitialization()",
  "error InvalidMerkleProof()",
  "error LimitOverflow()",
  "error NoStrategySet()",
  "error NotInitializing()",
  "error NotTokenOwner()",
  "error OwnableInvalidOwner(address owner)",
  "error OwnableUnauthorizedAccount(address account)",
  "error ReentrancyGuardReentrantCall()",
  "error StrategyExpired()",
  "error TransferFailed()",
  "error UUPSUnauthorizedCallContext()",
  "error UUPSUnsupportedProxiableUUID(bytes32 slot)",
  "error UseDeposit()",
  "error ZeroAddress()",
  "error ZeroAmount()",
] as const;

// Legacy pre-validUntilDay vault interface, kept for backward-compatible orchestrator reads of old contracts;
// auto-appended by generate-abis.sh — update manually if the old contract changes.
export const VAULT_ABI_LEGACY = [
  "function deposit(uint256 tokenId) payable",
  "function withdraw(uint256 tokenId, uint256 amount)",
  "function balanceOf(uint256) view returns (uint256)",
  "function strategyOf(uint256) view returns (bytes32 root, uint256 dailyLimit, uint256 dailySpent, uint64 resetDay)",
  "function setStrategy(uint256 tokenId, bytes32 root, uint256 dailyLimit)",
  "function recoverExcessNative(address)",
  "function execute(uint256 tokenId, address target, uint256 value, bytes data, bytes32[] proof) returns (bytes)",
  "event Deposited(uint256 indexed tokenId, address indexed from, address indexed asset, uint256 amount)",
  "event Withdrawn(uint256 indexed tokenId, address indexed to, address indexed asset, uint256 amount)",
  "event StrategySet(uint256 indexed tokenId, bytes32 strategyRoot, uint256 dailyLimit)",
  "event Executed(uint256 indexed tokenId, bytes32 indexed actionHash, address indexed target, uint256 value, bytes result)",
] as const;

// Minimal strategyOf fragments shared by the chat-runtime executor and the backend orchestrator
// for variant probing (current 5-tuple vs legacy 4-tuple returns).
export const STRATEGY_OF_CURRENT = [
  "function strategyOf(uint256) view returns (bytes32, uint256, uint256, uint64, uint64)",
] as const;

export const STRATEGY_OF_LEGACY = [
  "function strategyOf(uint256) view returns (bytes32, uint256, uint256, uint64)",
] as const;
