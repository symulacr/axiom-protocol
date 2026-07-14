
export type ChatToolClass =
  | "read"
  | "encode"
  | "orchestrate"
  | "archive"
  | "ask"
  | "skill";

export type ChatToolFriction = "low" | "medium" | "high";

export type ChatToolJsonSchema = {
  type: "object";
  properties: Record<string, { type: string; description?: string }>;
  required?: readonly string[];
};

export interface ChatToolSpec {
  name: string;
  class: ChatToolClass;
  label: string;
  hint: string;
  requiresWallet: boolean;
  requiresTokenId: boolean;
  friction: ChatToolFriction;
  parameters?: ChatToolJsonSchema;
  capabilities?: string[];
  os?: string;
  context?: string;
  requiresApiKey?: string;
}

function skill<N extends string>(def: Omit<ChatToolSpec, "class" | "name" | "requiresWallet" | "requiresTokenId"> & { name: N; requiresWallet?: boolean; requiresTokenId?: boolean }): ChatToolSpec & { name: N } {
  return { ...def, class: "skill", requiresWallet: def.requiresWallet ?? false, requiresTokenId: def.requiresTokenId ?? false };
}

function tool<N extends string>(def: Omit<ChatToolSpec, "name" | "requiresWallet" | "requiresTokenId"> & { name: N; requiresWallet?: boolean; requiresTokenId?: boolean }): ChatToolSpec & { name: N } {
  return { ...def, requiresWallet: def.requiresWallet ?? false, requiresTokenId: def.requiresTokenId ?? false };
}

const SKILL_TOOL_DEFS = [
  skill({ name: "evm_wallet", label: "EVM Wallet", hint: "Manage EVM wallet balance/network for an EOA (you have the wallet address)", friction: "low", parameters: { type: "object", properties: { address: { type: "string", description: "EOA wallet address" } }, required: ["address"] }, capabilities: ["evm", "wallet"], context: "reads default provider chain" }),
  skill({ name: "evm_multichain", label: "EVM Multichain", hint: "Query and interact across multiple EVM chains", friction: "medium", parameters: { type: "object", properties: { address: { type: "string", description: "EOA wallet address" } }, required: ["address"] }, capabilities: ["evm", "multichain"], context: "reads multiple EVM chains" }),
  skill({ name: "evm_tx", label: "EVM Transaction", hint: "Build, sign, and broadcast EVM transactions", requiresWallet: true, friction: "medium", parameters: { type: "object", properties: { hash: { type: "string", description: "Transaction hash" } }, required: ["hash"] }, capabilities: ["evm", "tx"], context: "reads default provider chain" }),
  skill({ name: "evm_token", label: "EVM Token", hint: "ERC-20/721 balances & transfers when you have the TOKEN contract address", friction: "low", parameters: { type: "object", properties: { address: { type: "string", description: "ERC-20/721 contract address" }, coingeckoId: { type: "string", description: "Optional CoinGecko id for price" } }, required: ["address"] }, capabilities: ["evm", "token"], context: "reads default provider chain" }),
  skill({ name: "evm_gas", label: "EVM Gas", hint: "Estimate gas prices and optimize transaction fees", friction: "low", parameters: { type: "object", properties: { gasLimit: { type: "number", description: "Optional gas limit (default 21000)" } }, required: [] }, capabilities: ["evm", "gas"], context: "reads default provider chain" }),
  skill({ name: "evm_whale", label: "EVM Whale", hint: "Track large EVM wallet movements and whale activity", friction: "medium", parameters: { type: "object", properties: { token: { type: "string", description: "ERC-20 contract address" }, minValue: { type: "string", description: "Min transfer value in wei" }, fromBlock: { type: "number", description: "Start block number" }, toBlock: { type: "number", description: "End block number" } }, required: ["token", "minValue", "fromBlock", "toBlock"] }, capabilities: ["evm", "whale"], context: "reads default provider chain" }),
  skill({ name: "evm_contract", label: "EVM Contract", hint: "Read and write to EVM smart contracts via ABI", friction: "medium", parameters: { type: "object", properties: { address: { type: "string", description: "Contract address" } }, required: ["address"] }, capabilities: ["evm", "contract"], context: "reads default provider chain" }),
  skill({ name: "evm_allowance", label: "EVM Allowance", hint: "ERC-20 approvals/allowances for a token+owner pair (owner address required)", requiresWallet: true, friction: "medium", parameters: { type: "object", properties: { address: { type: "string", description: "Owner address" }, token: { type: "string", description: "ERC-20 token contract address" } }, required: ["address", "token"] }, capabilities: ["evm", "allowance"], context: "reads default provider chain" }),
  skill({ name: "unbroker_simulate", label: "Unbroker Simulate", hint: "Simulate an unbroker trade before execution", requiresTokenId: true, friction: "low", parameters: { type: "object", properties: { tokenId: { type: "string", description: "Agent token ID (numeric)" }, to: { type: "string", description: "Recipient address" } }, required: ["tokenId", "to"] } }),
  skill({ name: "unbroker_route", label: "Unbroker Route", hint: "Find optimal swap routes across DEX aggregators", requiresTokenId: true, friction: "low", parameters: { type: "object", properties: { tokenId: { type: "string", description: "Agent token ID (numeric)" }, to: { type: "string", description: "Recipient address" } }, required: ["tokenId", "to"] } }),
  skill({ name: "unbroker_analyze", label: "Unbroker Analyze", hint: "Analyze swap quotes, slippage, and MEV risk", requiresTokenId: true, friction: "medium", parameters: { type: "object", properties: { tokenId: { type: "string", description: "Agent token ID (numeric)" }, to: { type: "string", description: "Recipient address" }, accessProof: { type: "object", description: "Optional access proof { dataHash, validUntil }" } }, required: ["tokenId", "to"] } }),
  skill({ name: "unbroker_execute", label: "Unbroker Execute", hint: "Execute an unbroker swap on-chain", requiresWallet: true, requiresTokenId: true, friction: "high", parameters: { type: "object", properties: { tokenId: { type: "string", description: "Agent token ID (numeric)" }, to: { type: "string", description: "Recipient address" } }, required: ["tokenId", "to"] } }),
  skill({ name: "stocks_quote", label: "Stocks Quote", hint: "Get real-time stock price quotes. You MUST pass a `symbol` (e.g. BTC-USD, AAPL). Never leave it blank.", friction: "low", parameters: { type: "object", properties: { symbol: { type: "string", description: "Ticker symbol" } }, required: ["symbol"] } }),
  skill({ name: "stocks_search", label: "Stocks Search", hint: "Search for stock tickers and company names. You MUST pass a `query` (e.g. 'Tesla'). Never leave it blank.", friction: "low", parameters: { type: "object", properties: { query: { type: "string", description: "Search query" } }, required: ["query"] } }),
  skill({ name: "stocks_history", label: "Stocks History", hint: "Fetch historical OHLCV price data for equities. You MUST pass a `symbol` (e.g. AAPL). Never leave it blank.", friction: "low", parameters: { type: "object", properties: { symbol: { type: "string", description: "Ticker symbol" }, range: { type: "string", description: "1d,5d,1mo,3mo,6mo,1y,5y,max (default 1y)" }, interval: { type: "string", description: "1m,5m,15m,1d,1wk,1mo (default 1d)" } }, required: ["symbol"] } }),
  skill({ name: "stocks_compare", label: "Stocks Compare", hint: "Compare fundamentals and performance across tickers. You MUST pass `symbols` as a non-empty array (e.g. ['AAPL','MSFT']). Never leave it blank.", friction: "medium", parameters: { type: "object", properties: { symbols: { type: "array", description: "List of ticker symbols (1-10)" } }, required: ["symbols"] } }),
  skill({ name: "stocks_crypto", label: "Stocks Crypto", hint: "Get cryptocurrency price quotes and market data", friction: "low", parameters: { type: "object", properties: { symbol: { type: "string", description: "Crypto pair (default BTC-USD)" } }, required: [] } }),
  skill({ name: "osint_sec_edgar", label: "SEC EDGAR", hint: "Search SEC filings, 10-K, 10-Q, and 8-K via EDGAR", friction: "low", parameters: { type: "object", properties: { cik: { type: "string", description: "SEC CIK number" } }, required: ["cik"] }, capabilities: ["osint", "edgar"], context: "external OSINT APIs" }),
  skill({ name: "osint_usaspending", label: "USAspending", hint: "Query US federal spending and contract awards", friction: "medium", parameters: { type: "object", properties: { filters: { type: "object", description: "USASpending search filter object" }, limit: { type: "number", description: "1-100 (default 10)" } }, required: ["filters"] }, capabilities: ["osint", "usaspending"], context: "external OSINT APIs" }),
  skill({ name: "osint_ofac_sdn", label: "OFAC SDN", hint: "Check entities against OFAC sanctions (SDN) list. You MUST pass a `name` (e.g. 'Gazprom'). Never leave it blank.", friction: "low", parameters: { type: "object", properties: { name: { type: "string", description: "Entity name" } }, required: ["name"] }, capabilities: ["osint", "ofac"], context: "external OSINT APIs" }),
  skill({ name: "osint_opencorporates", label: "OpenCorporates", hint: "Look up corporate registration and officer data. You MUST pass a `query` (e.g. 'Acme Corp'). Never leave it blank.", friction: "low", parameters: { type: "object", properties: { jurisdiction: { type: "string", description: "Jurisdiction code (default us)" }, query: { type: "string", description: "Company query" } }, required: ["query"] }, capabilities: ["osint", "opencorporates"], context: "external OSINT APIs" }),
  skill({ name: "osint_entity_resolve", label: "Entity Resolve", hint: "Resolve and cross-reference entities across OSINT sources", friction: "medium", parameters: { type: "object", properties: { entities: { type: "array", description: "List of entity names (2-20)" } }, required: ["entities"] }, capabilities: ["osint", "entity-resolve"], context: "external OSINT APIs" }),
  skill({ name: "osint_courtlistener", label: "CourtListener", hint: "Search US federal and state court opinions and filings. You MUST pass a `query` (e.g. 'fraud injunction'). Never leave it blank.", friction: "medium", parameters: { type: "object", properties: { query: { type: "string", description: "Search query" }, type: { type: "string", description: "o=opinions, r=recap (default o)" }, limit: { type: "number", description: "1-20 (default 10)" } }, required: ["query"] }, capabilities: ["osint", "courtlistener"], context: "external OSINT APIs" }),
  skill({ name: "oss_forensics_investigate", label: "OSS Investigate", hint: "Investigate an open-source project for supply-chain risks", friction: "medium", parameters: { type: "object", properties: { owner: { type: "string", description: "GitHub owner" }, repo: { type: "string", description: "GitHub repo" }, bytecode: { type: "string", description: "Optional hex bytecode for keccak256 comparison" } }, required: ["owner", "repo"] }, capabilities: ["forensics", "supply-chain"], requiresApiKey: "GITHUB_TOKEN", os: "linux", context: "network egress" }),
  skill({ name: "oss_forensics_commits", label: "OSS Commits", hint: "Analyze commit history for suspicious patterns", friction: "low", parameters: { type: "object", properties: { owner: { type: "string", description: "GitHub owner" }, repo: { type: "string", description: "GitHub repo" }, sha: { type: "string", description: "Optional branch/commit SHA" }, perPage: { type: "number", description: "1-100 (default 30)" } }, required: ["owner", "repo"] }, capabilities: ["forensics", "commits"], requiresApiKey: "GITHUB_TOKEN", os: "linux", context: "network egress" }),
  skill({ name: "oss_forensics_ioc", label: "OSS IOC", hint: "Extract indicators of compromise from repositories", friction: "medium", parameters: { type: "object", properties: { owner: { type: "string", description: "GitHub owner" }, repo: { type: "string", description: "GitHub repo" }, path: { type: "string", description: "Optional path filter" } }, required: ["owner", "repo"] }, capabilities: ["forensics", "ioc"], requiresApiKey: "GITHUB_TOKEN", os: "linux", context: "network egress" }),
  skill({ name: "oss_forensics_audit", label: "OSS Audit", hint: "Full supply-chain audit of dependencies and transitive deps", friction: "high", parameters: { type: "object", properties: { owner: { type: "string", description: "GitHub owner" }, repo: { type: "string", description: "GitHub repo" } }, required: ["owner", "repo"] }, capabilities: ["forensics", "audit"], requiresApiKey: "GITHUB_TOKEN", os: "linux", context: "network egress" }),
] as const;

export const CHAT_TOOL_CATALOG = [
  tool({ name: "list_my_agents", class: "read", label: "Your Agents", hint: "List all agent NFTs owned by the connected wallet address", requiresWallet: true, context: "on-chain read", capabilities: ["read","agents"], friction: "low", parameters: { type: "object", properties: {} } }),
  tool({ name: "vault_balance", class: "read", label: "Vault Balance", hint: "Get vault balance (in wei) for a given agent token ID", requiresTokenId: true, context: "on-chain read (vault)", capabilities: ["read","vault"], friction: "low", parameters: { type: "object", properties: { tokenId: { type: "string", description: "Agent token ID (numeric)" } }, required: ["tokenId"] } }),
  tool({ name: "agent_metadata", class: "read", label: "Agent Info", hint: "Get on-chain metadata for an agent (name, owner, data hash, description)", requiresTokenId: true, context: "on-chain read (metadata)", capabilities: ["read","metadata"], friction: "low", parameters: { type: "object", properties: { tokenId: { type: "string", description: "Agent token ID (numeric)" } }, required: ["tokenId"] } }),
  tool({ name: "event_history", class: "read", label: "Event History", hint: "Query recent on-chain events (Tick, Transfer, etc.)", context: "on-chain read (events)", capabilities: ["read","events"], friction: "low", parameters: { type: "object", properties: { eventName: { type: "string", description: "Filter by event name (Tick, Transfer)" }, limit: { type: "number", description: "Max events (default 20)" } } } }),
  tool({ name: "execute_tick", class: "orchestrate", label: "Execute Tick", hint: "Execute a strategy tick for an agent (simulation via orchestrator). tokenId optional; defaults to the session's last agent", requiresTokenId: false, friction: "high", parameters: { type: "object", properties: { tokenId: { type: "string", description: "Agent token ID (optional; defaults to session last agent)" } } } }),
  tool({ name: "simulate_tick", class: "orchestrate", label: "Simulate Tick", hint: "Dry-run tick preflight (vault balance + strategy) without live compute. tokenId optional; defaults to the session's last agent", requiresTokenId: false, friction: "low", parameters: { type: "object", properties: { tokenId: { type: "string", description: "Agent token ID (optional; defaults to session last agent)" } } } }),
  tool({ name: "mint_agent", class: "encode", label: "Mint Agent", hint: "Mint a new agent NFT. Opens MetaMask for the transaction.", requiresWallet: true, friction: "medium", parameters: { type: "object", properties: { dataDescription: { type: "string", description: "Human-readable agent name" }, dataHash: { type: "string", description: "Optional hex hash of the agent data. When omitted, a stable hash is derived from the agent name automatically." } }, required: ["dataDescription"] } }),
  tool({ name: "deposit", class: "encode", label: "Deposit", hint: "Deposit 0G into an agent vault. Opens MetaMask.", requiresWallet: true, requiresTokenId: true, friction: "medium", parameters: { type: "object", properties: { tokenId: { type: "string", description: "Agent token ID" }, amount: { type: "string", description: "Amount in 0G (e.g. 1.5)" } }, required: ["tokenId", "amount"] } }),
  tool({ name: "withdraw", class: "encode", label: "Withdraw", hint: "Withdraw 0G from an agent vault. Opens MetaMask.", requiresWallet: true, requiresTokenId: true, friction: "medium", parameters: { type: "object", properties: { tokenId: { type: "string", description: "Agent token ID" }, amount: { type: "string", description: "Amount in 0G (e.g. 0.5)" } }, required: ["tokenId", "amount"] } }),
  tool({ name: "archive_lookup", class: "archive", label: "Archive Lookup", hint: "Look up all Wayback Machine (Internet Archive) snapshots for a URL. Returns list of timestamps where the URL was archived. Use to find snapshotted posts of an account, confirm if a specific URL was ever archived, or get the snapshot URL to view in a browser. NOTE: Twitter/X is JS-rendered; snapshots only contain the HTML shell, not the actual bio or tweet text.", context: "network egress", os: "linux", capabilities: ["archive","wayback"], friction: "medium", parameters: { type: "object", properties: { url: { type: "string", description: "Full URL to look up (e.g. https://x.com/handle/status/123)" }, limit: { type: "number", description: "Max snapshots to return (default 50)" } }, required: ["url"] } }),
  tool({ name: "archive_account_tweets", class: "archive", label: "Archived Tweets", hint: "List all archived tweets for an X/Twitter account handle. Returns all tweet URLs that were captured by the Wayback Machine, with timestamps. Use to research an account's snapshotted history.", context: "network egress", os: "linux", capabilities: ["archive","wayback"], friction: "high", parameters: { type: "object", properties: { handle: { type: "string", description: "X/Twitter handle without @ (e.g. \"0xSero\")" }, limit: { type: "number", description: "Max snapshots to return (default 100)" } }, required: ["handle"] } }),
  tool({ name: "archive_confirm_deletion", class: "archive", label: "Confirm Archived", hint: "Check if a specific tweet URL was ever archived by the Wayback Machine. Returns { archived, snapshot, snapshotUrl } — useful as evidence that a post existed at a specific time even if it is now deleted. Does NOT extract tweet content.", context: "network egress", os: "linux", capabilities: ["archive","wayback"], friction: "medium", parameters: { type: "object", properties: { url: { type: "string", description: "Full tweet URL (e.g. https://x.com/handle/status/1234567890)" } }, required: ["url"] } }),
  tool({ name: "ask_user", class: "ask", label: "Ask User", hint: "Ask the user a concise, selectable question and wait for their answer before continuing. Use when a parameter is ambiguous or a decision needs human input — never invent the answer.", requiresWallet: false, requiresTokenId: false, friction: "low", parameters: { type: "object", properties: { question: { type: "string", description: "The question to ask the user" }, options: { type: "array", description: "2-4 short selectable answer options" }, multiSelect: { type: "boolean", description: "Allow more than one selection (default false)" } }, required: ["question"] } }),
  ...SKILL_TOOL_DEFS,
] as const;

export type ChatToolName = (typeof CHAT_TOOL_CATALOG)[number]["name"];

const byName = new Map<string, ChatToolSpec>(
  CHAT_TOOL_CATALOG.map((t) => [t.name, t] as const),
);

export function getChatToolSpec(name: string): ChatToolSpec | undefined {
  return byName.get(name);
}

export function classOfTool(name: string): ChatToolClass | undefined {
  return getChatToolSpec(name)?.class;
}

export const CHAT_TOOL_CLASS_LABELS: Record<ChatToolClass, string> = {
  read: "Read",
  encode: "Encode",
  orchestrate: "Orchestrate",
  archive: "Archive",
  ask: "Ask User",
  skill: "Hermes Skills (EVM, DeFi, OSINT, Forensics)",
};

export function toolsByClass(
  cls: ChatToolClass,
): readonly ChatToolSpec[] {
  return CHAT_TOOL_CATALOG.filter((t) => t.class === cls);
}

export function toolNamesByClass(cls: ChatToolClass): string[] {
  return toolsByClass(cls).map((t) => t.name);
}

export function chatToolLabels(): Record<string, string> {
  return Object.fromEntries(
    CHAT_TOOL_CATALOG.map((t) => [t.name, t.label]),
  );
}

export const CHAT_BENCH_READ_TOOLS = toolNamesByClass("read");
export const CHAT_BENCH_ENCODE_TOOLS = toolNamesByClass("encode");
export const CHAT_BENCH_ALL_TOOL_NAMES = CHAT_TOOL_CATALOG.map((t) => t.name);
