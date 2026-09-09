import { defaultChatModelForChain } from "./networks.js";

export type ChatToolClass =
  "read" | "encode" | "orchestrate" | "archive" | "ask" | "skill";

export type ChatToolFriction = "low" | "medium" | "high";

type ToolParam = {
  type: string;
  description?: string;
  /** Closed value set (JSON Schema `enum`); flows verbatim into the tools API payload. */
  enum?: readonly string[];
};

type ChatToolJsonSchema = {
  type: "object";
  properties: Record<string, ToolParam>;
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
}

/** Shared defaults: wallet/tokenId gates default off; class injected by the wrapper. */
function makeTool<N extends string>(
  cls: ChatToolClass,
  def: Omit<
    ChatToolSpec,
    "class" | "name" | "requiresWallet" | "requiresTokenId"
  > & { name: N; requiresWallet?: boolean; requiresTokenId?: boolean },
): ChatToolSpec & { name: N } {
  return {
    ...def,
    class: cls,
    requiresWallet: def.requiresWallet ?? false,
    requiresTokenId: def.requiresTokenId ?? false,
  };
}

function skill<N extends string>(
  def: Omit<
    ChatToolSpec,
    "class" | "name" | "requiresWallet" | "requiresTokenId"
  > & { name: N; requiresWallet?: boolean; requiresTokenId?: boolean },
): ChatToolSpec & { name: N } {
  return makeTool("skill", def);
}

function tool<N extends string>(
  def: Omit<ChatToolSpec, "name" | "requiresWallet" | "requiresTokenId"> & {
    name: N;
    requiresWallet?: boolean;
    requiresTokenId?: boolean;
  },
): ChatToolSpec & { name: N } {
  return makeTool(def.class, def);
}

function params(
  properties: Record<string, ToolParam>,
  required?: readonly string[],
): ChatToolJsonSchema {
  return required === undefined
    ? { type: "object", properties }
    : { type: "object", properties, required };
}

const addressParam = {
  type: "string",
  description: "EOA wallet address",
} as const;
const tokenIdParam = {
  type: "string",
  description: "Agent token ID (numeric)",
} as const;
const networkEgress = {
  os: "linux",
  context: "network egress",
} as const;

const providerChainContext = {
  context: "reads default provider chain",
} as const;
const osintContext = { context: "external OSINT APIs" } as const;

const archiveEgress = {
  ...networkEgress,
  capabilities: ["archive", "wayback"] as string[],
};

const tokenTransferProps = {
  tokenId: tokenIdParam,
  to: { type: "string", description: "Recipient address" },
} as const;

/** execute_tick/simulate_tick share this shape: tokenId falls back to the session's last agent. */
const optionalTokenIdParam = {
  tokenId: {
    type: "string",
    description: "Agent token ID (optional; defaults to session last agent)",
  },
} as const;

/** deposit/withdraw differ only in label/hint/amount example. */
function vaultOpTool(
  name: "deposit" | "withdraw",
  label: string,
  hint: string,
  amountExample: string,
): ChatToolSpec {
  return tool({
    name,
    class: "encode",
    label,
    hint:
      name === "withdraw"
        ? `${hint} Runs gas-free via the protocol GasTank when the tank has headroom; otherwise opens MetaMask.`
        : hint,
    requiresWallet: true,
    requiresTokenId: true,
    friction: "medium",
    parameters: params(
      {
        tokenId: { type: "string", description: "Agent token ID" },
        amount: {
          type: "string",
          description: `Amount in 0G (e.g. ${amountExample})`,
        },
      },
      ["tokenId", "amount"],
    ),
  });
}

/** W6 swap-pool token symbols the chat tools accept; resolved to addresses via
 *  AXM_TOKEN_ADDRESSES (paymentToken comes from the session addresses, the WETH
 *  mock is env-pinned). Values must match AxiomMockUSDC.sol symbols. */
export const AXM_SWAP_SYMBOLS = ["usdc", "weth"] as const;
export type AxmSwapSymbol = (typeof AXM_SWAP_SYMBOLS)[number];

/** env var pinning the deployed axmWETH mock (Galileo 16602: 0x62e5…f6ec). */
export const AXM_WETH_ENV_VAR = "AXIOM_SWAP_PAIR_TOKEN";

/** Resolve "usdc"|"weth" to the Processor pool token address. paymentToken is
 *  taken from the session's live addresses; weth from the env pin. Returns
 *  null when the requested side is not configured (caller surfaces a hint). */
export function resolveAxmTokenAddress(
  symbol: string,
  paymentToken: string | undefined,
  env: Record<string, string | undefined> = typeof process !== "undefined" &&
  process.env
    ? (process.env as Record<string, string | undefined>)
    : {},
): `0x${string}` | null {
  const s = symbol.trim().toLowerCase();
  if (s === "usdc" && paymentToken) return normalize(paymentToken);
  if (s === "weth") {
    const raw = env[AXM_WETH_ENV_VAR];
    return raw ? normalize(raw) : null;
  }
  return null;
}

function normalize(addr: string): `0x${string}` | null {
  return /^0x[0-9a-fA-F]{40}$/.test(addr.trim())
    ? (addr.trim().toLowerCase() as `0x${string}`)
    : null;
}

const SKILL_TOOL_DEFS = [
  skill({
    name: "evm_wallet",
    label: "EVM Wallet",
    hint: "Native balance for an EVM address, plus the ERC-20 balance when a token contract address is also passed",
    friction: "low",
    parameters: params(
      {
        address: addressParam,
        token: {
          type: "string",
          description:
            "Optional ERC-20 contract address to also read balanceOf",
        },
      },
      ["address"],
    ),
    capabilities: ["evm", "wallet"],
    ...providerChainContext,
  }),
  skill({
    name: "evm_multichain",
    label: "EVM Multichain",
    hint: "Native balances for one EVM address across several chains in one call (read-only)",
    friction: "medium",
    parameters: params({ address: addressParam }, ["address"]),
    capabilities: ["evm", "multichain"],
    context: "reads multiple EVM chains",
  }),
  skill({
    name: "evm_tx",
    label: "EVM Transaction",
    hint: "Fetch an EVM transaction and its receipt by hash (status, block, gas used). Read-only lookup; it cannot create, sign, or send transactions",
    requiresWallet: true,
    friction: "medium",
    parameters: params(
      { hash: { type: "string", description: "Transaction hash" } },
      ["hash"],
    ),
    capabilities: ["evm", "tx"],
    ...providerChainContext,
  }),
  skill({
    name: "evm_token",
    label: "EVM Token",
    hint: "ERC-20 token metadata (name, symbol, decimals) plus an optional CoinGecko price via coingeckoId. For balances use evm_wallet",
    friction: "low",
    parameters: params(
      {
        address: { type: "string", description: "ERC-20/721 contract address" },
        coingeckoId: {
          type: "string",
          description: "Optional CoinGecko id for price",
        },
      },
      ["address"],
    ),
    capabilities: ["evm", "token"],
    ...providerChainContext,
  }),
  skill({
    name: "evm_gas",
    label: "EVM Gas",
    hint: "Current gas price and estimated transaction cost (in wei and USD) for a gas limit",
    friction: "low",
    parameters: params(
      {
        gasLimit: {
          type: "number",
          description: "Optional gas limit (default 21000)",
        },
      },
      [],
    ),
    capabilities: ["evm", "gas"],
    ...providerChainContext,
  }),
  skill({
    name: "evm_whale",
    label: "EVM Whale",
    hint: "Scan a block range for ERC-20 Transfer events above a wei threshold (whale tracking)",
    friction: "medium",
    parameters: params(
      {
        token: { type: "string", description: "ERC-20 contract address" },
        minValue: { type: "string", description: "Min transfer value in wei" },
        fromBlock: { type: "number", description: "Start block number" },
        toBlock: { type: "number", description: "End block number" },
      },
      ["token", "minValue", "fromBlock", "toBlock"],
    ),
    capabilities: ["evm", "whale"],
    ...providerChainContext,
  }),
  skill({
    name: "evm_contract",
    label: "EVM Contract",
    hint: "Inspect an address for contract bytecode and resolve its EIP-1967 proxy implementation. Read-only; does not call contract methods",
    friction: "medium",
    parameters: params(
      { address: { type: "string", description: "Contract address" } },
      ["address"],
    ),
    capabilities: ["evm", "contract"],
    ...providerChainContext,
  }),
  skill({
    name: "evm_allowance",
    label: "EVM Allowance",
    hint: "Check an owner address's ERC-20 allowances for known DEX spender contracts (approval audit)",
    requiresWallet: true,
    friction: "medium",
    parameters: params(
      {
        address: { type: "string", description: "Owner address" },
        token: { type: "string", description: "ERC-20 token contract address" },
      },
      ["address", "token"],
    ),
    capabilities: ["evm", "allowance"],
    ...providerChainContext,
  }),
  skill({
    name: "unbroker_simulate",
    label: "Unbroker Simulate",
    hint: "Simulate an ERC-7857 agent transfer (tokenId → to) without sending: reports the current owner and data hash",
    requiresTokenId: true,
    friction: "low",
    parameters: params({ ...tokenTransferProps }, ["tokenId", "to"]),
  }),
  skill({
    name: "unbroker_route",
    label: "Unbroker Route",
    hint: "Compare ERC-7857 transfer paths (direct vs oracle re-key) with gas estimates",
    requiresTokenId: true,
    friction: "low",
    parameters: params({ ...tokenTransferProps }, ["tokenId", "to"]),
  }),
  skill({
    name: "unbroker_analyze",
    label: "Unbroker Analyze",
    hint: "Score a proposed ERC-7857 transfer for safety: validates the access proof against the agent's data hash and expiry",
    requiresTokenId: true,
    friction: "medium",
    parameters: params(
      {
        ...tokenTransferProps,
        accessProof: {
          type: "object",
          description: "Optional access proof { dataHash, validUntil }",
        },
      },
      ["tokenId", "to"],
    ),
  }),
  skill({
    name: "stocks_quote",
    label: "Stocks Quote",
    hint: "Get real-time stock price quotes. You MUST pass a `symbol` (e.g. BTC-USD, AAPL). Never leave it blank.",
    friction: "low",
    parameters: params(
      { symbol: { type: "string", description: "Ticker symbol" } },
      ["symbol"],
    ),
  }),
  skill({
    name: "stocks_search",
    label: "Stocks Search",
    hint: "Search for stock tickers and company names. You MUST pass a `query` (e.g. 'Tesla'). Never leave it blank.",
    friction: "low",
    parameters: params(
      { query: { type: "string", description: "Search query" } },
      ["query"],
    ),
  }),
  skill({
    name: "stocks_history",
    label: "Stocks History",
    hint: "Fetch historical OHLCV price data for equities. You MUST pass a `symbol` (e.g. AAPL). Never leave it blank.",
    friction: "low",
    parameters: params(
      {
        symbol: { type: "string", description: "Ticker symbol" },
        range: {
          type: "string",
          description: "1d,5d,1mo,3mo,6mo,1y,5y,max (default 1y)",
          enum: ["1d", "5d", "1mo", "3mo", "6mo", "1y", "5y", "max"],
        },
        interval: {
          type: "string",
          description: "1m,5m,15m,1d,1wk,1mo (default 1d)",
          enum: ["1m", "5m", "15m", "1d", "1wk", "1mo"],
        },
      },
      ["symbol"],
    ),
  }),
  skill({
    name: "stocks_compare",
    label: "Stocks Compare",
    hint: "Compare fundamentals and performance across tickers. You MUST pass `symbols` as a non-empty array (e.g. ['AAPL','MSFT']). Never leave it blank.",
    friction: "medium",
    parameters: params(
      {
        symbols: {
          type: "array",
          description: "List of ticker symbols (1-10)",
        },
      },
      ["symbols"],
    ),
  }),
  skill({
    name: "stocks_crypto",
    label: "Stocks Crypto",
    hint: "Intraday crypto pair quote (1-day window, 5-minute bars; defaults to BTC-USD). For equities or daily bars use stocks_quote",
    friction: "low",
    parameters: params(
      {
        symbol: {
          type: "string",
          description: "Crypto pair (default BTC-USD)",
        },
      },
      [],
    ),
  }),
  skill({
    name: "osint_sec_edgar",
    label: "SEC EDGAR",
    hint: "Search SEC filings, 10-K, 10-Q, and 8-K via EDGAR",
    friction: "low",
    parameters: params(
      { cik: { type: "string", description: "SEC CIK number" } },
      ["cik"],
    ),
    capabilities: ["osint", "edgar"],
    ...osintContext,
  }),
  skill({
    name: "osint_usaspending",
    label: "USAspending",
    hint: "Query US federal spending and contract awards",
    friction: "medium",
    parameters: params(
      {
        filters: {
          type: "object",
          description: "USASpending search filter object",
        },
        limit: { type: "number", description: "1-100 (default 10)" },
      },
      ["filters"],
    ),
    capabilities: ["osint", "usaspending"],
    ...osintContext,
  }),
  skill({
    name: "osint_ofac_sdn",
    label: "OFAC SDN",
    hint: "Check entities against OFAC sanctions (SDN) list. You MUST pass a `name` (e.g. 'Gazprom'). Never leave it blank.",
    friction: "low",
    parameters: params(
      { name: { type: "string", description: "Entity name" } },
      ["name"],
    ),
    capabilities: ["osint", "ofac"],
    ...osintContext,
  }),
  skill({
    name: "osint_company_search",
    label: "Company search",
    hint: "Look up legal entities worldwide by name via the GLEIF registry (no key needed). You MUST pass a `query` (e.g. 'Acme Corp'). Never leave it blank.",
    friction: "low",
    parameters: params(
      {
        limit: { type: "number", description: "1-20 (default 5)" },
        query: { type: "string", description: "Company name query" },
      },
      ["query"],
    ),
    capabilities: ["osint", "gleif"],
    ...osintContext,
  }),
  skill({
    name: "osint_entity_resolve",
    label: "Entity Resolve",
    hint: "Resolve and cross-reference entities across OSINT sources",
    friction: "medium",
    parameters: params(
      {
        entities: { type: "array", description: "List of entity names (2-20)" },
      },
      ["entities"],
    ),
    capabilities: ["osint", "entity-resolve"],
    ...osintContext,
  }),
  skill({
    name: "osint_courtlistener",
    label: "CourtListener",
    hint: "Search US federal and state court opinions and filings. You MUST pass a `query` (e.g. 'fraud injunction'). Never leave it blank.",
    friction: "medium",
    parameters: params(
      {
        query: { type: "string", description: "Search query" },
        type: {
          type: "string",
          description: "o=opinions, r=recap (default o)",
          enum: ["o", "r"],
        },
        limit: { type: "number", description: "1-20 (default 10)" },
      },
      ["query"],
    ),
    capabilities: ["osint", "courtlistener"],
    ...osintContext,
  }),
] as const;

export const CHAT_TOOL_CATALOG = [
  tool({
    name: "list_my_agents",
    class: "read",
    label: "Your Agents",
    hint: "List all agent NFTs owned by the connected wallet address",
    requiresWallet: true,
    context: "on-chain read",
    capabilities: ["read", "agents"],
    friction: "low",
    parameters: params({}),
  }),
  tool({
    name: "vault_balance",
    class: "read",
    label: "Vault Balance",
    hint: "Get vault balance (in wei) for a given agent token ID",
    requiresTokenId: true,
    context: "on-chain read (vault)",
    capabilities: ["read", "vault"],
    friction: "low",
    parameters: params({ tokenId: tokenIdParam }, ["tokenId"]),
  }),
  tool({
    name: "agent_metadata",
    class: "read",
    label: "Agent Info",
    hint: "Get on-chain metadata for an agent (name, owner, data hash, description)",
    requiresTokenId: true,
    context: "on-chain read (metadata)",
    capabilities: ["read", "metadata"],
    friction: "low",
    parameters: params({ tokenId: tokenIdParam }, ["tokenId"]),
  }),
  tool({
    name: "event_history",
    class: "read",
    label: "Event History",
    hint: "Query recent on-chain protocol events (Tick, Transfer, etc.), optionally filtered by event name. Protocol-wide feed, not scoped to one agent",
    context: "on-chain read (events)",
    capabilities: ["read", "events"],
    friction: "low",
    parameters: params({
      eventName: {
        type: "string",
        description: "Filter by event name (Tick, Transfer)",
      },
      limit: { type: "number", description: "Max events (default 20)" },
    }),
  }),
  tool({
    name: "gas_tank_status",
    class: "read",
    label: "Gas Tank Status",
    hint: "Get the connected wallet's GasTank status: prepaid gas balance, grants used/cap, and ops remaining. Zero balance with grants left = next ops are protocol-sponsored.",
    requiresWallet: true,
    context: "on-chain read (gas tank)",
    capabilities: ["read", "gas-tank"],
    friction: "low",
    parameters: params({}),
  }),
  tool({
    name: "faucet_status",
    class: "read",
    label: "Faucet Status",
    hint: "Check the wallet's W0G faucet status: whether the one-time wrap-drip is still claimable, its size (0.01 OG in W0G), the wallet's current W0G balance, and the remaining GasTank lazy gas grants. Already-claimed wallets report alreadyGranted with their balance.",
    requiresWallet: true,
    context: "backend read (faucet)",
    capabilities: ["read", "faucet"],
    friction: "low",
    parameters: params({}),
  }),
  tool({
    name: "execute_tick",
    class: "orchestrate",
    label: "Execute Tick",
    hint: "Run a live strategy tick for an agent through the orchestrator (executes the active strategy against the vault). tokenId optional; defaults to the session's last agent. Dry-run first with simulate_tick when unsure. Settlement requires the vault's strategy root to authorize this plan — for single-action (leaf-as-root) strategies pass plan with merkleProof implied empty; the server settles with the plan's exact target/value, and only if it matches the strategy root the owner signed",
    requiresTokenId: false,
    friction: "high",
    parameters: params({
      ...optionalTokenIdParam,
      plan: {
        type: "object",
        description:
          'Optional execution plan to settle on tick: target (address), value (human OG, e.g. "0.005"), data (optional calldata hex). Leaf-as-root strategies verify with an empty proof — implied, never sent',
      },
    }),
  }),
  tool({
    name: "simulate_tick",
    class: "orchestrate",
    label: "Simulate Tick",
    hint: "Dry-run tick preflight (vault balance + strategy) without live compute. tokenId optional; defaults to the session's last agent. A passed plan is preflighted the same way but never settles",
    requiresTokenId: false,
    friction: "low",
    parameters: params({
      ...optionalTokenIdParam,
      plan: {
        type: "object",
        description:
          "Optional execution plan to preflight: target (address), value (human OG), data (optional calldata hex)",
      },
    }),
  }),
  tool({
    name: "mint_agent",
    class: "encode",
    label: "Mint Agent",
    hint: "Mint a new Axiom iNFT agent. Requires dataDescription (agent name). Opens MetaMask. dataHash optional — derived from name if omitted. Registers dataHash with the oracle when possible.",
    requiresWallet: true,
    friction: "medium",
    parameters: params(
      {
        dataDescription: {
          type: "string",
          description: "Human-readable agent name (required)",
        },
        dataHash: {
          type: "string",
          description: "Optional 0x-prefixed hash. Omitted → keccak of name.",
        },
      },
      ["dataDescription"],
    ),
  }),
  vaultOpTool(
    "deposit",
    "Deposit",
    "Deposit 0G into an agent vault. Opens MetaMask.",
    "1.5",
  ),
  vaultOpTool(
    "withdraw",
    "Withdraw",
    "Withdraw 0G from an agent vault. Opens MetaMask.",
    "0.5",
  ),
  tool({
    name: "set_strategy",
    class: "encode",
    label: "Set Strategy",
    hint: "Set an agent vault's spending strategy (setStrategy) via the backend encode relay. dailyLimit is the daily spend cap in 0G (e.g. 1.5). validUntilDay is an optional UTC day index ('0' = no expiry). root is an optional 0x-prefixed Merkle strategy root. Omitted root/expiry keep the live strategyOf values, so a limit refresh never clears the strategy. Opens MetaMask (wallet lane only).",
    requiresWallet: true,
    requiresTokenId: true,
    friction: "medium",
    parameters: params(
      {
        tokenId: tokenIdParam,
        dailyLimit: {
          type: "string",
          description: "Daily spend cap in 0G human units (e.g. 1.5)",
        },
        validUntilDay: {
          type: "string",
          description:
            "UTC day index the strategy expires after; '0' = no expiry (default: keep the live expiry)",
        },
        root: {
          type: "string",
          description:
            "0x-prefixed 32-byte Merkle strategy root (default: keep the live root)",
        },
      },
      ["tokenId", "dailyLimit"],
    ),
  }),
  tool({
    name: "swap_tokens",
    class: "encode",
    label: "Swap Tokens",
    hint: "Swap axmUSDC ⇄ axmWETH through the Processor swap pool (swapExactIn). tokenIn is the pool symbol you pay with ('usdc' or 'weth'); amountIn is human units (e.g. 1.5); minOut optional slippage floor in human out-units. Requires a Permit2 allowance prerequisite: the wallet must first approve Permit2 for tokenIn (the tool reports the exact approve calldata when missing). Runs gasless via the protocol GasTank when the tank has headroom; otherwise opens MetaMask.",
    requiresWallet: true,
    friction: "medium",
    parameters: params(
      {
        tokenIn: {
          type: "string",
          description: "Pool token paid in: 'usdc' or 'weth'",
          enum: AXM_SWAP_SYMBOLS,
        },
        amountIn: {
          type: "string",
          description: "Amount in human token units (e.g. 1.5)",
        },
        minOut: {
          type: "string",
          description:
            "Minimum accepted output in human out-token units (optional slippage guard)",
        },
      },
      ["tokenIn", "amountIn"],
    ),
  }),
  tool({
    name: "add_liquidity",
    class: "encode",
    label: "Add Liquidity",
    hint: "Provide both pool tokens to earn LP shares (addLiquidity). usdcAmount and wethAmount are human units and must both be > 0. Requires a Permit2 BATCH allowance prerequisite: the wallet must approve Permit2 for BOTH tokens (the tool reports the approve calldata when missing). Because the batch permit needs one EIP-712 signature over two tokens, this tool runs the wallet lane only — it does NOT use the GasTank sponsor lane.",
    requiresWallet: true,
    friction: "medium",
    parameters: params(
      {
        usdcAmount: {
          type: "string",
          description: "axmUSDC side in human units (e.g. 100)",
        },
        wethAmount: {
          type: "string",
          description: "axmWETH side in human units (e.g. 0.1)",
        },
      },
      ["usdcAmount", "wethAmount"],
    ),
  }),
  tool({
    name: "borrow",
    class: "encode",
    label: "Borrow",
    hint: "Borrow axmUSDC against your agent earnings + LP-value collateral (borrow). amount is human axmUSDC; LTV cap 50% by default, pool reserve must cover it. No Permit2 needed — the op pays out to you. Runs gasless via the protocol GasTank when the tank has headroom; otherwise opens MetaMask.",
    requiresWallet: true,
    friction: "medium",
    parameters: params(
      {
        amount: {
          type: "string",
          description: "axmUSDC to borrow in human units (e.g. 10)",
        },
      },
      ["amount"],
    ),
  }),
  tool({
    name: "pay_for_agent",
    class: "encode",
    label: "Pay Agent",
    hint: "Pay an agent's creator (royalty split) and optionally its compute provider via AxiomPaymentProcessor. agentAmount is in USDC (e.g. 1.5). computeAmount optional: omit for a creator-only payment (payForAgent); provide >0 to also pay the compute provider (payForAgentAndCompute — then provider is required). Runs gas-free via the protocol GasTank when the tank has headroom; otherwise opens MetaMask.",
    requiresWallet: true,
    requiresTokenId: true,
    friction: "medium",
    parameters: params(
      {
        tokenId: { type: "string", description: "Agent token ID" },
        provider: {
          type: "string",
          description:
            "Compute provider address (optional; required when computeAmount is provided)",
        },
        agentAmount: {
          type: "string",
          description: "Agent creator payment in USDC (e.g. 1.5)",
        },
        computeAmount: {
          type: "string",
          description: "Compute provider payment in USDC (optional)",
        },
      },
      ["tokenId", "agentAmount"],
    ),
  }),
  tool({
    name: "transfer",
    class: "encode",
    label: "Transfer Agent",
    hint: "Transfer an agent (ERC-7857 iNFT) to a new owner with an EIP-712 access proof. Opens the transfer dialog in the UI — the wallet signs the proof and the on-chain iTransferFrom. tokenId required.",
    requiresWallet: true,
    requiresTokenId: true,
    friction: "high",
    parameters: params(
      {
        tokenId: { type: "string", description: "Agent token ID" },
      },
      ["tokenId"],
    ),
  }),
  tool({
    name: "archive_lookup",
    class: "archive",
    label: "Archive Lookup",
    hint: "Look up all Wayback Machine (Internet Archive) snapshots for a URL. Returns list of timestamps where the URL was archived. Use to find snapshotted posts of an account, confirm if a specific URL was ever archived, or get the snapshot URL to view in a browser. NOTE: Twitter/X is JS-rendered; snapshots only contain the HTML shell, not the actual bio or tweet text.",
    ...archiveEgress,
    friction: "medium",
    parameters: params(
      {
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
      ["url"],
    ),
  }),
  tool({
    name: "archive_account_tweets",
    class: "archive",
    label: "Archived Tweets",
    hint: "List all archived tweets for an X/Twitter account handle. Returns all tweet URLs that were captured by the Wayback Machine, with timestamps. Use to research an account's snapshotted history.",
    ...archiveEgress,
    friction: "high",
    parameters: params(
      {
        handle: {
          type: "string",
          description: 'X/Twitter handle without @ (e.g. "0xSero")',
        },
        limit: {
          type: "number",
          description: "Max snapshots to return (default 100)",
        },
      },
      ["handle"],
    ),
  }),
  tool({
    name: "archive_confirm_deletion",
    class: "archive",
    label: "Confirm Archived",
    hint: "Check if a specific tweet URL was ever archived by the Wayback Machine. Returns { archived, snapshot, snapshotUrl } — useful as evidence that a post existed at a specific time even if it is now deleted. Does NOT extract tweet content.",
    ...archiveEgress,
    friction: "medium",
    parameters: params(
      {
        url: {
          type: "string",
          description:
            "Full tweet URL (e.g. https://x.com/handle/status/1234567890)",
        },
      },
      ["url"],
    ),
  }),
  tool({
    name: "ask_user",
    class: "ask",
    label: "Ask User",
    hint: "Ask the user a concise, selectable question and wait for their answer before continuing. Use when a parameter is ambiguous or a decision needs human input — never invent the answer.",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "low",
    parameters: params(
      {
        question: {
          type: "string",
          description: "The question to ask the user",
        },
        options: {
          type: "array",
          description: "2-4 short selectable answer options",
        },
        multiSelect: {
          type: "boolean",
          description: "Allow more than one selection (default false)",
        },
      },
      ["question"],
    ),
  }),
  ...SKILL_TOOL_DEFS,
] as const;

export type ChatToolName = (typeof CHAT_TOOL_CATALOG)[number]["name"];

/** Phase-1 sponsored tools (V3 W5-B): encode-class ops the relayer can execute
 *  gas-free through the GasTank before falling back to the wallet lane.
 *  W9 adds the DeFi surface: swap_tokens and borrow are single-permit /
 *  permit-free Processor ops. add_liquidity stays wallet-only — its Permit2
 *  BATCH permit needs a two-token EIP-712 signature the sponsor capability
 *  does not model. */
export const SPONSORED_TOOLS = [
  "withdraw",
  "pay_for_agent",
  "swap_tokens",
  "borrow",
] as const;

export type SponsoredToolName = (typeof SPONSORED_TOOLS)[number];

export function isSponsoredTool(name: string): name is SponsoredToolName {
  return (SPONSORED_TOOLS as readonly string[]).includes(name);
}

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

export function toolsByClass(cls: ChatToolClass): readonly ChatToolSpec[] {
  return CHAT_TOOL_CATALOG.filter((t) => t.class === cls);
}

function toolNamesByClass(cls: ChatToolClass): string[] {
  return toolsByClass(cls).map((t) => t.name);
}

export function chatToolLabels(): Record<string, string> {
  return Object.fromEntries(CHAT_TOOL_CATALOG.map((t) => [t.name, t.label]));
}

export const CHAT_BENCH_READ_TOOLS = toolNamesByClass("read");
export const CHAT_BENCH_ENCODE_TOOLS = toolNamesByClass("encode");
export const CHAT_BENCH_ALL_TOOL_NAMES = CHAT_TOOL_CATALOG.map((t) => t.name);

/** UI/system-prompt display name, distinct from the compute model id below. */
export const AXIOM_ASSISTANT_NAME = "Axiom";

/** Router model id, not assistant name; Galileo (16602) defaults to qwen2.5-omni (no deepseek in its catalog). */
export const DEFAULT_CHAT_MODEL = "deepseek-v4-flash";

export function resolveChatModel(override?: string, chainId?: number): string {
  return override?.trim() || defaultChatModelForChain(chainId);
}

const FALLBACK_CONTEXT_WINDOWS: Record<string, number> = {
  // qwen2.5-omni is the real Galileo catalog id (16602 default model).
  "qwen2.5-omni": 32768,
  "qwen/qwen2.5-omni-7b": 32768,
  // Probed against the live 0G router catalog 2026-09-09: context_length 1,000,000.
  "deepseek-v4-flash": 1000000,
};

/** Live catalog probe 2026-09-09: max_completion_tokens per model. Used as the
 *  output reserve in the chat history budget; unknown models fall back to a
 *  flat 4096 at the call site. */
const FALLBACK_MAX_COMPLETION_TOKENS: Record<string, number> = {
  // Live-probed 2026-09-09: aliyun/tencent services allow 393,216, openrouter
  // 65,536 (probe-research-context.md capability matrix).
  "deepseek-v4-flash": 393216,
};

export function resolveContextWindow(
  model: string,
  live?: Record<string, number>,
): number {
  const id = model.trim().toLowerCase();
  if (live) {
    const hit = Object.entries(live).find(([k]) => k.toLowerCase() === id);
    if (hit) return hit[1];
  }
  const fb = Object.entries(FALLBACK_CONTEXT_WINDOWS).find(
    ([k]) => k.toLowerCase() === id,
  );
  return fb ? fb[1] : 32768;
}

export function resolveMaxCompletionTokens(
  model: string,
  live?: Record<string, number>,
): number | undefined {
  const id = model.trim().toLowerCase();
  if (live) {
    const hit = Object.entries(live).find(([k]) => k.toLowerCase() === id);
    if (hit) return hit[1];
  }
  const fb = Object.entries(FALLBACK_MAX_COMPLETION_TOKENS).find(
    ([k]) => k.toLowerCase() === id,
  );
  return fb?.[1];
}
