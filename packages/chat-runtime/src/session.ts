import type { ChatToolName } from "@axiom/config/chat-tools";
import type { ChatSessionContext, ToolResult } from "./types.js";

export function createSession(
  partial: Partial<ChatSessionContext> & { chainId: number },
): ChatSessionContext {
  return {
    chainId: partial.chainId,
    walletAddress: partial.walletAddress,
    lastTokenId: partial.lastTokenId,
    lastToolName: partial.lastToolName,
    backendUrl: partial.backendUrl,
    addresses: partial.addresses,
  };
}

export function buildSessionContext(session: ChatSessionContext): string {
  const parts: string[] = [];
  if (session.lastTokenId) parts.push(`default tokenId: ${session.lastTokenId}`);
  if (session.walletAddress) parts.push(`wallet: ${session.walletAddress}`);
  return parts.join("; ");
}

export function applyToolResult(
  session: ChatSessionContext,
  name: ChatToolName | string,
  result: ToolResult,
): ChatSessionContext {
  session.lastToolName = name as ChatToolName;
  try {
    const obj = JSON.parse(result.content) as Record<string, unknown>;
    if (obj.tokenId !== undefined) session.lastTokenId = String(obj.tokenId);
    if (obj.agents && Array.isArray(obj.agents) && obj.agents[0]) {
      const first = obj.agents[0] as Record<string, unknown>;
      if (first.tokenId !== undefined) session.lastTokenId = String(first.tokenId);
    }
    if (obj.url !== undefined) {
      (session as ChatSessionContext & { lastUrl?: string }).lastUrl = String(obj.url);
    }
  } catch {
    // ignore non-json
  }
  return session;
}

const MAX_TOOL_CHARS = 1200;

/** Compress old tool JSON in message history for context growth stability. */
export function compressToolContent(content: string | null): string | null {
  if (!content || content.length <= MAX_TOOL_CHARS) return content;
  try {
    const obj = JSON.parse(content) as Record<string, unknown>;
    const keys = Object.keys(obj).slice(0, 6);
    const summary: Record<string, unknown> = { _summary: true };
    for (const k of keys) summary[k] = obj[k];
    return JSON.stringify(summary);
  } catch {
    return content.slice(0, MAX_TOOL_CHARS) + "…";
  }
}