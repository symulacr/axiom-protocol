/**
 * Chat tool taxonomy — single catalog for frontend, backend bench, and docs.
 * Class drives UX grouping, bench lanes, and friction expectations.
 */

export type ChatToolClass =
  | "read"
  | "encode"
  | "orchestrate"
  | "archive"
  | "skill";

export type ChatToolFriction = "low" | "medium" | "high";

export interface ChatToolSpec {
  name: string;
  class: ChatToolClass;
  label: string;
  /** Short hint for chat UI / a11y */
  hint: string;
  requiresWallet: boolean;
  requiresTokenId: boolean;
  /** Bench: encode-only (backend returns calldata, no on-chain tx in CI) */
  encodeOnly?: boolean;
  friction: ChatToolFriction;
}

/** Skill tool definitions — compact: name, label, hint, wallet/token flags, friction. */
const SKILL_TOOL_DEFS = [
  { name: "evm_wallet",                label: "EVM Wallet",         hint: "Manage EVM wallet balance, address, and network",             requiresWallet: false, requiresTokenId: false, friction: "low" as const },
  { name: "evm_multichain",            label: "EVM Multichain",     hint: "Query and interact across multiple EVM chains",               requiresWallet: false, requiresTokenId: false, friction: "medium" as const },
  { name: "evm_tx",                    label: "EVM Transaction",    hint: "Build, sign, and broadcast EVM transactions",                 requiresWallet: true,  requiresTokenId: false, friction: "medium" as const },
  { name: "evm_token",                 label: "EVM Token",          hint: "Query ERC-20/721 token balances, metadata, and transfers",    requiresWallet: false, requiresTokenId: false, friction: "low" as const },
  { name: "evm_gas",                   label: "EVM Gas",            hint: "Estimate gas prices and optimize transaction fees",           requiresWallet: false, requiresTokenId: false, friction: "low" as const },
  { name: "evm_whale",                 label: "EVM Whale",          hint: "Track large EVM wallet movements and whale activity",         requiresWallet: false, requiresTokenId: false, friction: "medium" as const },
  { name: "evm_contract",              label: "EVM Contract",       hint: "Read and write to EVM smart contracts via ABI",               requiresWallet: false, requiresTokenId: false, friction: "medium" as const },
  { name: "evm_allowance",             label: "EVM Allowance",      hint: "Check and manage ERC-20 token approvals and allowances",      requiresWallet: true,  requiresTokenId: false, friction: "medium" as const },
  { name: "unbroker_simulate",         label: "Unbroker Simulate",  hint: "Simulate an unbroker trade before execution",                 requiresWallet: false, requiresTokenId: false, friction: "low" as const },
  { name: "unbroker_route",            label: "Unbroker Route",     hint: "Find optimal swap routes across DEX aggregators",             requiresWallet: false, requiresTokenId: false, friction: "low" as const },
  { name: "unbroker_analyze",          label: "Unbroker Analyze",   hint: "Analyze swap quotes, slippage, and MEV risk",                 requiresWallet: false, requiresTokenId: false, friction: "medium" as const },
  { name: "unbroker_execute",          label: "Unbroker Execute",   hint: "Execute an unbroker swap on-chain",                           requiresWallet: true,  requiresTokenId: false, friction: "high" as const },
  { name: "stocks_quote",              label: "Stocks Quote",       hint: "Get real-time stock price quotes",                            requiresWallet: false, requiresTokenId: false, friction: "low" as const },
  { name: "stocks_search",             label: "Stocks Search",      hint: "Search for stock tickers and company names",                  requiresWallet: false, requiresTokenId: false, friction: "low" as const },
  { name: "stocks_history",            label: "Stocks History",     hint: "Fetch historical OHLCV price data for equities",              requiresWallet: false, requiresTokenId: false, friction: "low" as const },
  { name: "stocks_compare",            label: "Stocks Compare",     hint: "Compare fundamentals and performance across tickers",         requiresWallet: false, requiresTokenId: false, friction: "medium" as const },
  { name: "stocks_crypto",             label: "Stocks Crypto",      hint: "Get cryptocurrency price quotes and market data",             requiresWallet: false, requiresTokenId: false, friction: "low" as const },
  { name: "osint_sec_edgar",           label: "SEC EDGAR",          hint: "Search SEC filings, 10-K, 10-Q, and 8-K via EDGAR",          requiresWallet: false, requiresTokenId: false, friction: "low" as const },
  { name: "osint_usaspending",         label: "USAspending",        hint: "Query US federal spending and contract awards",               requiresWallet: false, requiresTokenId: false, friction: "medium" as const },
  { name: "osint_ofac_sdn",            label: "OFAC SDN",           hint: "Check entities against OFAC sanctions (SDN) list",            requiresWallet: false, requiresTokenId: false, friction: "low" as const },
  { name: "osint_opencorporates",      label: "OpenCorporates",     hint: "Look up corporate registration and officer data",             requiresWallet: false, requiresTokenId: false, friction: "low" as const },
  { name: "osint_entity_resolve",      label: "Entity Resolve",     hint: "Resolve and cross-reference entities across OSINT sources",   requiresWallet: false, requiresTokenId: false, friction: "medium" as const },
  { name: "osint_courtlistener",       label: "CourtListener",      hint: "Search US federal and state court opinions and filings",      requiresWallet: false, requiresTokenId: false, friction: "medium" as const },
  { name: "oss_forensics_investigate", label: "OSS Investigate",    hint: "Investigate an open-source project for supply-chain risks",   requiresWallet: false, requiresTokenId: false, friction: "medium" as const },
  { name: "oss_forensics_commits",     label: "OSS Commits",        hint: "Analyze commit history for suspicious patterns",              requiresWallet: false, requiresTokenId: false, friction: "low" as const },
  { name: "oss_forensics_ioc",         label: "OSS IOC",            hint: "Extract indicators of compromise from repositories",         requiresWallet: false, requiresTokenId: false, friction: "medium" as const },
  { name: "oss_forensics_audit",       label: "OSS Audit",          hint: "Full supply-chain audit of dependencies and transitive deps", requiresWallet: false, requiresTokenId: false, friction: "high" as const },
] as const;

const SKILL_TOOLS: ChatToolSpec[] = SKILL_TOOL_DEFS.map((t) => ({ ...t, class: "skill" as const }));

export const CHAT_TOOL_CATALOG: readonly ChatToolSpec[] = [
  {
    name: "list_my_agents",
    class: "read",
    label: "Your Agents",
    hint: "Lists NFTs owned by the connected wallet",
    requiresWallet: true,
    requiresTokenId: false,
    friction: "low",
  },
  {
    name: "vault_balance",
    class: "read",
    label: "Vault Balance",
    hint: "Reads on-chain vault balance for a token ID",
    requiresWallet: false,
    requiresTokenId: true,
    friction: "low",
  },
  {
    name: "agent_metadata",
    class: "read",
    label: "Agent Info",
    hint: "Reads NFT metadata and owner from chain",
    requiresWallet: false,
    requiresTokenId: true,
    friction: "low",
  },
  {
    name: "event_history",
    class: "read",
    label: "Event History",
    hint: "Polls backend event store (Tick, Transfer, …)",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "low",
  },
  {
    name: "execute_tick",
    class: "orchestrate",
    label: "Execute Tick",
    hint: "Runs orchestrator strategy tick (may use live compute)",
    requiresWallet: false,
    requiresTokenId: true,
    friction: "high",
  },
  {
    name: "simulate_tick",
    class: "orchestrate",
    label: "Simulate Tick",
    hint: "Dry-run tick preflight without live compute",
    requiresWallet: false,
    requiresTokenId: true,
    friction: "low",
  },
  {
    name: "mint_agent",
    class: "encode",
    label: "Mint Agent",
    hint: "Encodes mint tx; wallet signs and submits",
    requiresWallet: true,
    requiresTokenId: false,
    encodeOnly: true,
    friction: "medium",
  },
  {
    name: "deposit",
    class: "encode",
    label: "Deposit",
    hint: "Encodes vault deposit; wallet signs",
    requiresWallet: true,
    requiresTokenId: true,
    encodeOnly: true,
    friction: "medium",
  },
  {
    name: "withdraw",
    class: "encode",
    label: "Withdraw",
    hint: "Encodes vault withdraw; wallet signs",
    requiresWallet: true,
    requiresTokenId: true,
    encodeOnly: true,
    friction: "medium",
  },
  {
    name: "archive_lookup",
    class: "archive",
    label: "Archive Lookup",
    hint: "Fast Wayback closest snapshot for a URL",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "medium",
  },
  {
    name: "archive_account_tweets",
    class: "archive",
    label: "Archived Tweets",
    hint: "Lists archived tweet URLs for an X handle (CDX)",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "high",
  },
  {
    name: "archive_confirm_deletion",
    class: "archive",
    label: "Confirm Archived",
    hint: "Checks if a URL was ever snapshotted (deletion evidence)",
    requiresWallet: false,
    requiresTokenId: false,
    friction: "medium",
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

/** Alias for callers that want `classOfTool("mint_agent")` → `"encode"`. */
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

/** Bench lanes derived from class — less duplicated friction in E2E. */
export const CHAT_BENCH_READ_TOOLS = toolNamesByClass("read");
export const CHAT_BENCH_ENCODE_TOOLS = toolNamesByClass("encode");
export const CHAT_BENCH_ARCHIVE_TOOLS = toolNamesByClass("archive");
export const CHAT_BENCH_ORCHESTRATE_TOOLS = toolNamesByClass("orchestrate");
export const CHAT_BENCH_SKILL_TOOLS = toolNamesByClass("skill");
export const CHAT_BENCH_ALL_TOOL_NAMES = CHAT_TOOL_CATALOG.map((t) => t.name);
