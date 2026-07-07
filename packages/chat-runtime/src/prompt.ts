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
    ctx ? `Session: ${ctx}.` : "",
    "Tool classes:",
    `READ — ${CHAT_TOOL_CLASS_LABELS.read}:\n${byClass("read")}`,
    `ENCODE — ${CHAT_TOOL_CLASS_LABELS.encode} (wallet signs):\n${byClass("encode")}`,
    `ORCHESTRATE — ${CHAT_TOOL_CLASS_LABELS.orchestrate}:\n${byClass("orchestrate")}`,
    `ARCHIVE — ${CHAT_TOOL_CLASS_LABELS.archive} (use archive_confirm_deletion before full lookup):\n${byClass("archive")}`,
    "Prefer /closest-style archive tools for single URLs; use simulate_tick before execute_tick when unsure.",
  ]
    .filter(Boolean)
    .join("\n\n");
}