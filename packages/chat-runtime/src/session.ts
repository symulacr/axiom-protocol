import type { ChatToolName } from "@axiom/config/chat-tools";
import { resolveContextWindow } from "@axiom/config/chat-tools";
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
  if (session.lastTokenId)
    parts.push(`default tokenId: ${session.lastTokenId}`);
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
      if (first.tokenId !== undefined)
        session.lastTokenId = String(first.tokenId);
    }
  } catch {
		// malformed tool result body parsing is best-effort and silently ignored
  }
  return session;
}

const MAX_TOOL_CHARS = 1200;
const HARD_TOOL_CHARS = 6000;

type ChatApiMessage = {
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

function toChatApiMessages(
  messages: ReadonlyArray<{
    role: "user" | "assistant" | "tool";
    content: string | null;
    tool_calls?: ChatApiMessage["tool_calls"];
    tool_call_id?: string;
    name?: string;
  }>,
): ChatApiMessage[] {
  return messages.map((msg) => {
    const content =
      msg.role === "tool" ? compressToolContent(msg.content) : msg.content;
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

function compressToolContent(content: string | null): string | null {
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

function estimateTokens(text: string | number): number {
  return Math.ceil((typeof text === "string" ? text.length : text) / 4);
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
    estimateTokens(opts.system) +
    estimateTokens(JSON.stringify(opts.tools ?? []));
  const maxHistoryTokens = Math.max(0, budget - overheadTokens);
  const history = toChatApiMessages(messages);
  if (history.length <= keep) return history;
  if (estimateTokens(JSON.stringify(history)) <= maxHistoryTokens)
    return history;
	// Exact array length is Σ|s| + k + 1 (brackets + k commas); precomputed so drops avoid re-stringifying (O(n²) → O(n)).
  const serialized = history.map((m) => JSON.stringify(m));
  let totalLen =
    serialized.reduce((a, s) => a + s.length, 0) + serialized.length + 1;
  let drop = 0;
  for (const s of serialized) {
    if (history.length - drop <= keep) break;
    if (estimateTokens(totalLen) <= maxHistoryTokens) break;
		totalLen -= s.length + 1;
    drop++;
  }
  return history.slice(drop);
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

export const MAX_TOOL_LOOPS = 10;

export function summarizeConversation<
  T extends { role: string; content: string | null },
>(msgs: T[], recentKeep = RECENT_KEEP): string {
  if (msgs.length <= recentKeep) return "";
  const oldest = msgs.slice(0, msgs.length - recentKeep);
  let out = "";
  for (const m of oldest) {
    const text = (m.content ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!text) continue;
    const line = `[${m.role}] ${text}\n`;
    if (out.length + line.length > 800) break;
    out += line;
  }
  return out.trim();
}

type ContinueSignal = {
  type: "continue";
  reason: "tool_loop_budget_exceeded";
} | null;

export function evaluateContinue(
  loopCount: number,
  maxLoops = MAX_TOOL_LOOPS,
): { exhausted: boolean; signal: ContinueSignal } {
  if (loopCount < maxLoops) return { exhausted: false, signal: null };
  return {
    exhausted: true,
    signal: { type: "continue", reason: "tool_loop_budget_exceeded" },
  };
}

export function shouldAutoContinue(
  signal: ContinueSignal,
  criticalRequest: boolean,
): boolean {
  return signal !== null && !criticalRequest;
}
