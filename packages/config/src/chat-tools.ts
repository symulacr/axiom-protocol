
export type ChatToolClass =
  | "read"
  | "encode"
  | "orchestrate"
  | "archive"
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
  encodeOnly?: boolean;
  friction: ChatToolFriction;
  parameters?: ChatToolJsonSchema;
}

const SKILL_TOOL_DEFS = [
  {
    name: "evm_wallet",
    label: "EVM Wallet",
    hint: "Manage EVM wallet balance/network for an EOA (you have the wallet address)",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "low" as const,
    parameters: {
      type: "object",
      properties: {
        address: { type: "string", description: "EOA wallet address" },
      },
      required: ["address"],
    },
  },
  {
    name: "evm_multichain",
    label: "EVM Multichain",
    hint: "Query and interact across multiple EVM chains",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "medium" as const,
    parameters: {
      type: "object",
      properties: {
        address: { type: "string", description: "EOA wallet address" },
      },
      required: ["address"],
    },
  },
  {
    name: "evm_tx",
    label: "EVM Transaction",
    hint: "Build, sign, and broadcast EVM transactions",
    requiresWallet: true,
    requiresTokenId: false,
    friction: "medium" as const,
    parameters: {
      type: "object",
      properties: {
        hash: { type: "string", description: "Transaction hash" },
      },
      required: ["hash"],
    },
  },
  {
    name: "evm_token",
    label: "EVM Token",
    hint: "ERC-20/721 balances & transfers when you have the TOKEN contract address",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "low" as const,
    parameters: {
      type: "object",
      properties: {
        address: { type: "string", description: "ERC-20/721 contract address" },
        coingeckoId: { type: "string", description: "Optional CoinGecko id for price" },
      },
      required: ["address"],
    },
  },
  {
    name: "evm_gas",
    label: "EVM Gas",
    hint: "Estimate gas prices and optimize transaction fees",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "low" as const,
    parameters: {
      type: "object",
      properties: {
        gasLimit: { type: "number", description: "Optional gas limit (default 21000)" },
      },
      required: [],
    },
  },
  {
    name: "evm_whale",
    label: "EVM Whale",
    hint: "Track large EVM wallet movements and whale activity",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "medium" as const,
    parameters: {
      type: "object",
      properties: {
        token: { type: "string", description: "ERC-20 contract address" },
        minValue: { type: "string", description: "Min transfer value in wei" },
        fromBlock: { type: "number", description: "Start block number" },
        toBlock: { type: "number", description: "End block number" },
      },
      required: ["token", "minValue", "fromBlock", "toBlock"],
    },
  },
  {
    name: "evm_contract",
    label: "EVM Contract",
    hint: "Read and write to EVM smart contracts via ABI",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "medium" as const,
    parameters: {
      type: "object",
      properties: {
        address: { type: "string", description: "Contract address" },
      },
      required: ["address"],
    },
  },
  {
    name: "evm_allowance",
    label: "EVM Allowance",
    hint: "ERC-20 approvals/allowances for a token+owner pair (owner address required)",
    requiresWallet: true,
    requiresTokenId: false,
    friction: "medium" as const,
    parameters: {
      type: "object",
      properties: {
        address: { type: "string", description: "Owner address" },
        token: { type: "string", description: "ERC-20 token contract address" },
      },
      required: ["address", "token"],
    },
  },
  {
    name: "unbroker_simulate",
    label: "Unbroker Simulate",
    hint: "Simulate an unbroker trade before execution",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "low" as const,
    parameters: {
      type: "object",
      properties: {
        tokenId: { type: "string", description: "Agent token ID (numeric)" },
        to: { type: "string", description: "Recipient address" },
      },
      required: ["tokenId", "to"],
    },
  },
  {
    name: "unbroker_route",
    label: "Unbroker Route",
    hint: "Find optimal swap routes across DEX aggregators",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "low" as const,
    parameters: {
      type: "object",
      properties: {
        tokenId: { type: "string", description: "Agent token ID (numeric)" },
        to: { type: "string", description: "Recipient address" },
      },
      required: ["tokenId", "to"],
    },
  },
  {
    name: "unbroker_analyze",
    label: "Unbroker Analyze",
    hint: "Analyze swap quotes, slippage, and MEV risk",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "medium" as const,
    parameters: {
      type: "object",
      properties: {
        tokenId: { type: "string", description: "Agent token ID (numeric)" },
        to: { type: "string", description: "Recipient address" },
        accessProof: { type: "object", description: "Optional access proof { dataHash, validUntil }" },
      },
      required: ["tokenId", "to"],
    },
  },
  {
    name: "unbroker_execute",
    label: "Unbroker Execute",
    hint: "Execute an unbroker swap on-chain",
    requiresWallet: true,
    requiresTokenId: false,
    friction: "high" as const,
    parameters: {
      type: "object",
      properties: {
        tokenId: { type: "string", description: "Agent token ID (numeric)" },
        to: { type: "string", description: "Recipient address" },
      },
      required: ["tokenId", "to"],
    },
  },
  {
    name: "stocks_quote",
    label: "Stocks Quote",
    hint: "Get real-time stock price quotes",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "low" as const,
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "stocks_search",
    label: "Stocks Search",
    hint: "Search for stock tickers and company names",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "low" as const,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "stocks_history",
    label: "Stocks History",
    hint: "Fetch historical OHLCV price data for equities",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "low" as const,
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol" },
        range: { type: "string", description: "1d,5d,1mo,3mo,6mo,1y,5y,max (default 1y)" },
        interval: { type: "string", description: "1m,5m,15m,1d,1wk,1mo (default 1d)" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "stocks_compare",
    label: "Stocks Compare",
    hint: "Compare fundamentals and performance across tickers",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "medium" as const,
    parameters: {
      type: "object",
      properties: {
        symbols: { type: "array", description: "List of ticker symbols (1-10)" },
      },
      required: ["symbols"],
    },
  },
  {
    name: "stocks_crypto",
    label: "Stocks Crypto",
    hint: "Get cryptocurrency price quotes and market data",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "low" as const,
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Crypto pair (default BTC-USD)" },
      },
      required: [],
    },
  },
  {
    name: "osint_sec_edgar",
    label: "SEC EDGAR",
    hint: "Search SEC filings, 10-K, 10-Q, and 8-K via EDGAR",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "low" as const,
    parameters: {
      type: "object",
      properties: {
        cik: { type: "string", description: "SEC CIK number" },
      },
      required: ["cik"],
    },
  },
  {
    name: "osint_usaspending",
    label: "USAspending",
    hint: "Query US federal spending and contract awards",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "medium" as const,
    parameters: {
      type: "object",
      properties: {
        filters: { type: "object", description: "USASpending search filter object" },
        limit: { type: "number", description: "1-100 (default 10)" },
      },
      required: ["filters"],
    },
  },
  {
    name: "osint_ofac_sdn",
    label: "OFAC SDN",
    hint: "Check entities against OFAC sanctions (SDN) list",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "low" as const,
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Entity name" },
      },
      required: ["name"],
    },
  },
  {
    name: "osint_opencorporates",
    label: "OpenCorporates",
    hint: "Look up corporate registration and officer data",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "low" as const,
    parameters: {
      type: "object",
      properties: {
        jurisdiction: { type: "string", description: "Jurisdiction code (default us)" },
        query: { type: "string", description: "Company query" },
      },
      required: ["query"],
    },
  },
  {
    name: "osint_entity_resolve",
    label: "Entity Resolve",
    hint: "Resolve and cross-reference entities across OSINT sources",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "medium" as const,
    parameters: {
      type: "object",
      properties: {
        entities: { type: "array", description: "List of entity names (2-20)" },
      },
      required: ["entities"],
    },
  },
  {
    name: "osint_courtlistener",
    label: "CourtListener",
    hint: "Search US federal and state court opinions and filings",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "medium" as const,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        type: { type: "string", description: "o=opinions, r=recap (default o)" },
        limit: { type: "number", description: "1-20 (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "oss_forensics_investigate",
    label: "OSS Investigate",
    hint: "Investigate an open-source project for supply-chain risks",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "medium" as const,
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "GitHub owner" },
        repo: { type: "string", description: "GitHub repo" },
        bytecode: { type: "string", description: "Optional hex bytecode for keccak256 comparison" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "oss_forensics_commits",
    label: "OSS Commits",
    hint: "Analyze commit history for suspicious patterns",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "low" as const,
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "GitHub owner" },
        repo: { type: "string", description: "GitHub repo" },
        sha: { type: "string", description: "Optional branch/commit SHA" },
        perPage: { type: "number", description: "1-100 (default 30)" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "oss_forensics_ioc",
    label: "OSS IOC",
    hint: "Extract indicators of compromise from repositories",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "medium" as const,
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "GitHub owner" },
        repo: { type: "string", description: "GitHub repo" },
        path: { type: "string", description: "Optional path filter" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "oss_forensics_audit",
    label: "OSS Audit",
    hint: "Full supply-chain audit of dependencies and transitive deps",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "high" as const,
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "GitHub owner" },
        repo: { type: "string", description: "GitHub repo" },
      },
      required: ["owner", "repo"],
    },
  },
] as const;

const SKILL_TOOLS: ChatToolSpec[] = SKILL_TOOL_DEFS.map((t) => ({ ...t, class: "skill" as const }));

export const CHAT_TOOL_CATALOG: readonly ChatToolSpec[] = [
  {
    name: "list_my_agents",
    class: "read",
    label: "Your Agents",
    hint: "List all agent NFTs owned by the connected wallet address",
    requiresWallet: true,
    requiresTokenId: false,
    friction: "low",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "vault_balance",
    class: "read",
    label: "Vault Balance",
    hint: "Get vault balance (in wei) for a given agent token ID",
    requiresWallet: false,
    requiresTokenId: true,
    friction: "low",
    parameters: {
      type: "object",
      properties: {
        tokenId: { type: "string", description: "Agent token ID (numeric)" },
      },
      required: ["tokenId"],
    },
  },
  {
    name: "agent_metadata",
    class: "read",
    label: "Agent Info",
    hint: "Get on-chain metadata for an agent (name, owner, data hash, description)",
    requiresWallet: false,
    requiresTokenId: true,
    friction: "low",
    parameters: {
      type: "object",
      properties: {
        tokenId: { type: "string", description: "Agent token ID (numeric)" },
      },
      required: ["tokenId"],
    },
  },
  {
    name: "event_history",
    class: "read",
    label: "Event History",
    hint: "Query recent on-chain events (Tick, Transfer, etc.)",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "low",
    parameters: {
      type: "object",
      properties: {
        eventName: {
          type: "string",
          description: "Filter by event name (Tick, Transfer)",
        },
        limit: { type: "number", description: "Max events (default 20)" },
      },
    },
  },
  {
    name: "execute_tick",
    class: "orchestrate",
    label: "Execute Tick",
    hint: "Execute a strategy tick for an agent (simulation via orchestrator). tokenId optional; defaults to the session's last agent",
    requiresWallet: false,
    requiresTokenId: true,
    friction: "high",
    parameters: {
      type: "object",
      properties: {
        tokenId: { type: "string", description: "Agent token ID (optional; defaults to session last agent)" },
      },
    },
  },
  {
    name: "simulate_tick",
    class: "orchestrate",
    label: "Simulate Tick",
    hint: "Dry-run tick preflight (vault balance + strategy) without live compute. tokenId optional; defaults to the session's last agent",
    requiresWallet: false,
    requiresTokenId: true,
    friction: "low",
    parameters: {
      type: "object",
      properties: {
        tokenId: { type: "string", description: "Agent token ID (optional; defaults to session last agent)" },
      },
    },
  },
  {
    name: "mint_agent",
    class: "encode",
    label: "Mint Agent",
    hint: "Mint a new agent NFT. Opens MetaMask for the transaction.",
    requiresWallet: true,
    requiresTokenId: false,
    encodeOnly: true,
    friction: "medium",
    parameters: {
      type: "object",
      properties: {
        dataDescription: {
          type: "string",
          description: "Human-readable agent name",
        },
        dataHash: {
          type: "string",
          description: "Hex hash of the agent data",
        },
      },
      required: ["dataDescription", "dataHash"],
    },
  },
  {
    name: "deposit",
    class: "encode",
    label: "Deposit",
    hint: "Deposit 0G into an agent vault. Opens MetaMask.",
    requiresWallet: true,
    requiresTokenId: true,
    encodeOnly: true,
    friction: "medium",
    parameters: {
      type: "object",
      properties: {
        tokenId: { type: "string", description: "Agent token ID" },
        amount: { type: "string", description: "Amount in 0G (e.g. 1.5)" },
      },
      required: ["tokenId", "amount"],
    },
  },
  {
    name: "withdraw",
    class: "encode",
    label: "Withdraw",
    hint: "Withdraw 0G from an agent vault. Opens MetaMask.",
    requiresWallet: true,
    requiresTokenId: true,
    encodeOnly: true,
    friction: "medium",
    parameters: {
      type: "object",
      properties: {
        tokenId: { type: "string", description: "Agent token ID" },
        amount: { type: "string", description: "Amount in 0G (e.g. 0.5)" },
      },
      required: ["tokenId", "amount"],
    },
  },
  {
    name: "archive_lookup",
    class: "archive",
    label: "Archive Lookup",
    hint: "Look up all Wayback Machine (Internet Archive) snapshots for a URL. Returns list of timestamps where the URL was archived. Use to find snapshotted posts of an account, confirm if a specific URL was ever archived, or get the snapshot URL to view in a browser. NOTE: Twitter/X is JS-rendered; snapshots only contain the HTML shell, not the actual bio or tweet text.",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "medium",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description:
            "Full URL to look up (e.g. https://x.com/handle/status/123)",
        },
        limit: {
          type: "number",
          description: "Max snapshots to return (default 50)",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "archive_account_tweets",
    class: "archive",
    label: "Archived Tweets",
    hint: "List all archived tweets for an X/Twitter account handle. Returns all tweet URLs that were captured by the Wayback Machine, with timestamps. Use to research an account's snapshotted history.",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "high",
    parameters: {
      type: "object",
      properties: {
        handle: {
          type: "string",
          description: 'X/Twitter handle without @ (e.g. "0xSero")',
        },
        limit: {
          type: "number",
          description: "Max snapshots to return (default 100)",
        },
      },
      required: ["handle"],
    },
  },
  {
    name: "archive_confirm_deletion",
    class: "archive",
    label: "Confirm Archived",
    hint: "Check if a specific tweet URL was ever archived by the Wayback Machine. Returns { archived, snapshot, snapshotUrl } — useful as evidence that a post existed at a specific time even if it is now deleted. Does NOT extract tweet content.",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "medium",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description:
            "Full tweet URL (e.g. https://x.com/handle/status/1234567890)",
        },
      },
      required: ["url"],
    },
  },
  ...SKILL_TOOLS,
] as const;

export type ChatToolName = (typeof CHAT_TOOL_CATALOG)[number]["name"];

const byName = new Map(
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

export function isEncodeTool(name: string): boolean {
  return getChatToolSpec(name)?.class === "encode";
}

export function isReadTool(name: string): boolean {
  return getChatToolSpec(name)?.class === "read";
}

export function isSkillTool(name: string): boolean {
  return getChatToolSpec(name)?.class === "skill";
}

export function chatToolLabels(): Record<string, string> {
  return Object.fromEntries(
    CHAT_TOOL_CATALOG.map((t) => [t.name, t.label]),
  );
}

export const CHAT_BENCH_READ_TOOLS = toolNamesByClass("read");
export const CHAT_BENCH_ENCODE_TOOLS = toolNamesByClass("encode");
export const CHAT_BENCH_ARCHIVE_TOOLS = toolNamesByClass("archive");
export const CHAT_BENCH_ORCHESTRATE_TOOLS = toolNamesByClass("orchestrate");
export const CHAT_BENCH_SKILL_TOOLS = toolNamesByClass("skill");
export const CHAT_BENCH_ALL_TOOL_NAMES = CHAT_TOOL_CATALOG.map((t) => t.name);
