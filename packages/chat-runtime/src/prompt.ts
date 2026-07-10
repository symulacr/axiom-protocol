import {
  CHAT_TOOL_CATALOG,
  CHAT_TOOL_CLASS_LABELS,
  type ChatToolClass,
} from "@axiom/config/chat-tools";
import { buildSessionContext } from "./session.js";
import type { ChatSessionContext } from "./types.js";

export function buildSystemPrompt(session: ChatSessionContext): string {
  const byClass = (cls: ChatToolClass) =>
    CHAT_TOOL_CATALOG.filter((t) => t.class === cls)
      .map((t) => `${t.name} (${t.label}): ${t.hint}`)
      .join("\n");

  const ctx = buildSessionContext(session);

  return [
    "You are the Axiom Protocol assistant with on-chain and archive tools.",
    "Always respond in English, regardless of the language the user writes in.",
    "Only call tools explicitly listed above. Never invent or guess tool names; if a capability is missing, say so plainly.",
    "When the user asks about their agents, vaults, balances, or on-chain activity, call the relevant READ tool (e.g. list_my_agents, vault_balance) instead of answering from memory.",
    "Stay strictly on-topic: Axiom Protocol agents (ERC-7857 iNFTs), vaults, the 0G market, and connected tools. If a request is out of scope, say so briefly.",
    "Be concise and direct.",
    ctx ? `Session: ${ctx}.` : "",
    "Tool classes:",
    `READ — ${CHAT_TOOL_CLASS_LABELS.read}:\n${byClass("read")}`,
    `ENCODE — ${CHAT_TOOL_CLASS_LABELS.encode} (wallet signs):\n${byClass("encode")}`,
    `ORCHESTRATE — ${CHAT_TOOL_CLASS_LABELS.orchestrate}:\n${byClass("orchestrate")}`,
    `ARCHIVE — ${CHAT_TOOL_CLASS_LABELS.archive} (use archive_confirm_deletion before full lookup):\n${byClass("archive")}`,
    `SKILL — ${CHAT_TOOL_CLASS_LABELS.skill}:\n${byClass("skill")}`,
    "Skills: EVM reads across 8 chains; Stocks via Yahoo Finance; OSINT cross-references public records; OSS Forensics investigates supply chain; Unbroker verifies transfers.",
    "Prefer /closest-style archive tools for single URLs; use simulate_tick before execute_tick when unsure.",
  ]
    .filter(Boolean)
    .join("\n\n");
}