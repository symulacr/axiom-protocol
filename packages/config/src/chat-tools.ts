/**
 * Chat tool taxonomy — single catalog for frontend, backend bench, and docs.
 * Class drives UX grouping, bench lanes, and friction expectations.
 */

export type ChatToolClass =
  | "read"
  | "encode"
  | "orchestrate"
  | "archive";

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
export const CHAT_BENCH_ALL_TOOL_NAMES = CHAT_TOOL_CATALOG.map((t) => t.name);