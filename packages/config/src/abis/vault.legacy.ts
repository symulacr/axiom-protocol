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
  "function strategyOf(uint256) view returns (bytes32, uint256, uint256, uint64)"
] as const;
