import type { ChatToolName } from "@axiom/config/chat-tools";
import { resolveContextWindow } from "@axiom/config/models";
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
  }
  return session;
}

const MAX_TOOL_CHARS = 1200;
const HARD_TOOL_CHARS = 6000;

export type ChatApiMessage = {
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
};

export function toChatApiMessages(
  messages: ReadonlyArray<{
    role: "user" | "assistant" | "tool";
    content: string | null;
    tool_calls?: ChatApiMessage["tool_calls"];
    tool_call_id?: string;
    name?: string;
  }>,
): ChatApiMessage[] {
  return messages.map((msg, index) => {
    const content =
      msg.role === "tool"
        ? compressToolContent(msg.content)
        : msg.content;
    const api: ChatApiMessage = {
      role: msg.role,
      content: content ?? null,
    };
    if (msg.tool_calls?.length) api.tool_calls = msg.tool_calls;
    if (msg.tool_call_id) api.tool_call_id = msg.tool_call_id;
    if (msg.name) api.name = msg.name;
    return api;
  });
}

export function compressToolContent(content: string | null): string | null {
  if (!content) return content;
  if (content.length > HARD_TOOL_CHARS) {
    return content.slice(0, HARD_TOOL_CHARS) + "…";
  }
  if (content.length <= MAX_TOOL_CHARS) return content;
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

const OUTPUT_RESERVE_TOKENS = 4096;
const SAFETY_MARGIN_TOKENS = 1024;
const RECENT_KEEP = 6;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function fitToContext(
  messages: ChatApiMessage[],
  opts: {
    model: string;
    system: string;
    tools?: unknown;
    recentKeep?: number;
    contextWindow?: number;
  },
): ChatApiMessage[] {
  const window = opts.contextWindow ?? resolveContextWindow(opts.model);
  const budget = window - OUTPUT_RESERVE_TOKENS - SAFETY_MARGIN_TOKENS;
  const keep = opts.recentKeep ?? RECENT_KEEP;
  const overheadTokens =
    estimateTokens(opts.system) + estimateTokens(JSON.stringify(opts.tools ?? []));
  const maxHistoryTokens = Math.max(0, budget - overheadTokens);
  let history = toChatApiMessages(messages);
  while (history.length > keep) {
    if (estimateTokens(JSON.stringify(history)) <= maxHistoryTokens) break;
    history = history.slice(1);
  }
  return history;
}

export function compactHistory<T extends ChatApiMessage>(
  messages: T[],
  summary: string | null,
  recentKeep = RECENT_KEEP,
): T[] {
  if (!summary || messages.length === 0) return messages;
  const keep = Math.min(recentKeep, messages.length);
  const recent = messages.slice(messages.length - keep);
  const summaryMsg = {
    ...recent[0],
    role: "user" as const,
    content: `[Earlier conversation summary]\n${summary}`,
    tool_calls: undefined,
    tool_call_id: undefined,
    name: undefined,
  } as unknown as T;
  return [summaryMsg, ...recent];
}