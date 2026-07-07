/** Wave E-6 and earlier deploys: 3-arg setStrategy, 4-tuple strategyOf (no validUntilDay). */
export const VAULT_ABI_LEGACY = [
  "function deposit(uint256 tokenId) payable",
  "function withdraw(uint256 tokenId, uint256 amount)",
  "function balanceOf(uint256) view returns (uint256)",
  "function strategyOf(uint256) view returns (bytes32 root, uint256 dailyLimit, uint256 dailySpent, uint64 resetDay)",
  "function setStrategy(uint256 tokenId, bytes32 root, uint256 dailyLimit)",
  "function recoverExcessNative(uint256 tokenId, uint256 amount)",
  "function execute(uint256 tokenId, address target, uint256 value, bytes data, bytes32[] proof) returns (bytes)",
  "event Deposited(uint256 indexed tokenId, address indexed from, address indexed asset, uint256 amount)",
  "event Withdrawn(uint256 indexed tokenId, address indexed to, address indexed asset, uint256 amount)",
  "event StrategySet(uint256 indexed tokenId, bytes32 strategyRoot, uint256 dailyLimit)",
  "event Executed(uint256 indexed tokenId, bytes32 indexed actionHash, address indexed target, uint256 value, bytes result)",
] as const;

/** Current deploys: 4-arg setStrategy with optional strategy expiry day. */
export const VAULT_ABI = [
  "function deposit(uint256 tokenId) payable",
  "function withdraw(uint256 tokenId, uint256 amount)",
  "function balanceOf(uint256) view returns (uint256)",
  "function strategyOf(uint256) view returns (bytes32 root, uint256 dailyLimit, uint256 dailySpent, uint64 resetDay, uint64 validUntilDay)",
  "function setStrategy(uint256 tokenId, bytes32 root, uint256 dailyLimit, uint64 validUntilDay)",
  "function recoverExcessNative(uint256 tokenId, uint256 amount)",
  "function execute(uint256 tokenId, address target, uint256 value, bytes data, bytes32[] proof) returns (bytes)",
  "event Deposited(uint256 indexed tokenId, address indexed from, address indexed asset, uint256 amount)",
  "event Withdrawn(uint256 indexed tokenId, address indexed to, address indexed asset, uint256 amount)",
  "event StrategySet(uint256 indexed tokenId, bytes32 strategyRoot, uint256 dailyLimit, uint64 validUntilDay)",
  "event Executed(uint256 indexed tokenId, bytes32 indexed actionHash, address indexed target, uint256 value, bytes result)",
] as const;
