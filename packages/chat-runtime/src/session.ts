import type { ChatToolName } from "@axiom/config/chat-tools";
import {
  getChatToolSpec,
  resolveContextWindow,
  resolveMaxCompletionTokens,
  CHAT_TOOL_CATALOG,
} from "@axiom/config/chat-tools";
import type { ChatSessionContext, ToolResult } from "./types.js";
import { toolFail, type ToolRuntime } from "./transport.js";
import { runReadTool } from "./executors/read.js";
import { runEncodeTool } from "./executors/encode.js";
import { runOrchestrateTool } from "./executors/orchestrate.js";
import { runArchiveTool } from "./executors/archive.js";
import { runSkillTool } from "./executors/skill.js";
import { runAskTool } from "./executors/ask.js";

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  const spec = getChatToolSpec(name);
  if (!spec) return toolFail(`Unknown tool: ${name}`);
  switch (spec.class) {
    case "read":
      return runReadTool(name, args, ctx);
    case "encode":
      return runEncodeTool(name, args, ctx);
    case "orchestrate":
      return runOrchestrateTool(name, args, ctx);
    case "archive":
      return runArchiveTool(name, args, ctx);
    case "ask":
      return runAskTool(name, args, ctx);
    case "skill":
      return runSkillTool(name, args, ctx);
    default:
      return toolFail(`Unhandled class: ${spec.class}`);
  }
}

type ToolCallLike = { function: { name: string } };

export function groupParallelTools<T extends ToolCallLike>(calls: T[]): T[][] {
  const batches: T[][] = [];
  let open: T[] | null = null;

  for (const tc of calls) {
    if (isWalletBound(tc)) {
      if (open?.length) {
        batches.push(open);
        open = null;
      }
      batches.push([tc]);
    } else {
      if (!open) open = [];
      open.push(tc);
    }
  }
  if (open?.length) batches.push(open);

  return batches;
}

function isWalletBound(tc: ToolCallLike): boolean {
  const spec = getChatToolSpec(tc.function.name);
  return (
    spec?.class === "encode" ||
    (spec?.class === "orchestrate" && tc.function.name === "execute_tick") ||
    (spec?.class === "skill" && spec?.requiresWallet === true)
  );
}

export function createSession(
  partial: Partial<ChatSessionContext> & { chainId: number },
): ChatSessionContext {
  return {
    chainId: partial.chainId,
    walletAddress: partial.walletAddress,
    lastTokenId: partial.lastTokenId,
    lastToolName: partial.lastToolName,
    lastPlan: partial.lastPlan,
    backendUrl: partial.backendUrl,
    addresses: partial.addresses,
  };
}

export function applyToolResult(
  session: ChatSessionContext,
  name: ChatToolName | string,
  result: ToolResult,
): ChatSessionContext {
  session.lastToolName = name as ChatToolName;
  try {
    // Tool bodies may be { data: … }-wrapped or concatenated JSON objects — try whole body, then first object only.
    const text = result.content.trim();
    const firstObjEnd = (() => {
      let depth = 0,
        inStr = false,
        esc = false;
      for (let i = 0; i < text.length; i++) {
        const c = text[i]!;
        if (esc) {
          esc = false;
          continue;
        }
        if (c === "\\") {
          esc = true;
          continue;
        }
        if (c === '"') {
          inStr = !inStr;
          continue;
        }
        if (inStr) continue;
        if (c === "{" || c === "[") depth++;
        else if (c === "}" || c === "]") {
          depth--;
          if (depth === 0) return i + 1;
        }
      }
      return -1;
    })();
    const candidates = [text];
    if (firstObjEnd > 0 && firstObjEnd < text.length)
      candidates.push(text.slice(0, firstObjEnd));
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate) as
          Record<string, unknown> | Array<unknown>;
        const obj = (Array.isArray(parsed) ? parsed[0] : parsed) as
          Record<string, unknown> | undefined;
        if (!obj || typeof obj !== "object") continue;
        const source = (
          obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)
            ? { ...obj, ...(obj.data as Record<string, unknown>) }
            : obj
        ) as Record<string, unknown>;
        if (source.tokenId !== undefined) {
          session.lastTokenId = String(source.tokenId);
          break;
        }
        const agents = Array.isArray(source.agents) ? source.agents : undefined;
        const first = agents?.[0] as Record<string, unknown> | undefined;
        if (first?.tokenId !== undefined) {
          session.lastTokenId = String(first.tokenId);
          break;
        }
      } catch {
        // try next candidate
      }
    }
    // A successful plan-head call consumes it; failures keep the plan for retry. Reads never
    // clear the plan (interstitial list_my_agents etc. is expected mid-flow) — a successful
    // off-plan STATE-CHANGING call means the model re-planned, so drop the stale plan.
    if (session.lastPlan?.length && result.ok) {
      if (session.lastPlan[0] === name) session.lastPlan.shift();
      else if (!session.lastPlan.includes(name) && isStateChanging(name))
        session.lastPlan = [];
    }
  } catch {
    // malformed tool result body parsing is best-effort and silently ignored
  }
  return session;
}

// Heuristic scope note: applyToolResult never sees assistant prose (transport passes tool results
// only), so plan capture from assistant messages belongs to the caller; detectPlan is the shared
// matcher so the caller cannot drift from this contract, and matchPlan maps plan items onto real
// tool names so "next" continuity calls the actual catalog tool instead of prose.
const TOOL_NAMES = new Set<string>(CHAT_TOOL_CATALOG.map((t) => t.name));

const PLAN_ITEM_RE = /^\s*\d+[.)]\s+(.+)$/;

function isStateChanging(name: string): boolean {
  const spec = getChatToolSpec(name);
  return spec?.class === "encode" || spec?.class === "orchestrate";
}

/** Numbered-list items from assistant prose ("1. Mint the agent" → ["Mint the agent"]). */
export function detectPlan(assistantText: string): string[] {
  const items: string[] = [];
  for (const line of assistantText.split("\n")) {
    const m = PLAN_ITEM_RE.exec(line);
    if (m) {
      const item = m[1]!.trim();
      if (item) items.push(item);
    } else if (items.length) {
      // prose after the list ends it
      break;
    }
  }
  return items;
}

const PLAN_WORD_RE =
  /\b(mint|deposit|fund|withdraw|strategy|tick|simulate_tick|execute_tick|pay|transfer|list_my_agents|vault_balance|agent_metadata|event_history|pay_for_agent|mint_agent|simulate|execute)\b/i;

export function matchPlan(items: string[]): string[] {
  const tools: string[] = [];
  for (const item of items) {
    const words = item.match(PLAN_WORD_RE);
    if (!words) break;
    const tool = words[0]!.toLowerCase().replace(/\s+/g, "_");
    if (!TOOL_NAMES.has(tool)) {
      // single known alias in the flow vocabulary → canonical name, else drop the item
      const alias: Record<string, string> = {
        mint: "mint_agent",
        fund: "deposit",
        tick: "simulate_tick",
        strategy: "set_strategy",
      };
      const mapped = alias[tool];
      if (!mapped || !TOOL_NAMES.has(mapped)) break;
      tools.push(mapped);
    } else {
      tools.push(tool);
    }
  }
  return tools;
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

/** History budget rule (user directive 2026-09-09): history gets at most 80%
 *  of the resolved context window minus reserves. The reserve is the catalog's
 *  max_completion_tokens when known, else this flat default. */
const HISTORY_BUDGET_FRACTION = 0.8;
const DEFAULT_OUTPUT_RESERVE_TOKENS = 4096;
const SAFETY_MARGIN_TOKENS = 1024;
/** Floor, never a target: keep at least this many recent messages even when
 *  the token budget is already exhausted. */
const RECENT_KEEP = 6;
/** Backend transport ceiling: the chat router rejects payloads over ~4MB,
 *  about 1M tokens at the len/4 estimate. The budget never exceeds this even
 *  when a catalog window does, so the token estimate is the only cap. */
const MAX_PAYLOAD_TOKENS = 1_000_000;

function estimateTokens(text: string | number): number {
  return Math.ceil((typeof text === "string" ? text.length : text) / 4);
}

/**
 * Snap a front-cut start index forward past `tool` messages. A tool result is
 * only valid directly after the assistant message carrying its tool_calls —
 * a payload that starts on (or jumps into) the middle of a tool block is
 * rejected by providers with a 400 "Messages with role 'tool' must be a
 * response to a preceding message with 'tool_calls'". Front-cuts only ever
 * need this one rule: an assistant-with-tool_calls start is safe because its
 * tool results immediately follow it in this app's message construction.
 */
export function snapHistoryStart<T extends { role: string }>(
  messages: readonly T[],
  start: number,
): number {
  let i = Math.max(0, start);
  while (i < messages.length && messages[i]!.role === "tool") i++;
  return i;
}

export function fitToContext(
  messages: ChatApiMessage[],
  opts: {
    model: string;
    system: string;
    tools?: unknown;
    recentKeep?: number;
    contextWindow?: number;
    outputReserve?: number;
  },
): ChatApiMessage[] {
  const window = opts.contextWindow ?? resolveContextWindow(opts.model);
  const reserve =
    opts.outputReserve ??
    resolveMaxCompletionTokens(opts.model) ??
    DEFAULT_OUTPUT_RESERVE_TOKENS;
  const budget =
    Math.min(Math.floor(window * HISTORY_BUDGET_FRACTION), MAX_PAYLOAD_TOKENS) -
    reserve -
    SAFETY_MARGIN_TOKENS;
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
    // Stop when the budget fits or the RECENT_KEEP floor is reached.
    if (history.length - drop <= keep) break;
    if (estimateTokens(totalLen) <= maxHistoryTokens) break;
    totalLen -= s.length + 1;
    drop++;
  }
  return history.slice(snapHistoryStart(history, drop));
}

export const MAX_TOOL_LOOPS = 10;

/** Summarize exactly the passed messages (the caller hands in the dropped
 *  prefix). 800-char cap keeps the pinned lead a small, stable prefix. */
export function summarizeConversation<
  T extends { role: string; content: string | null },
>(msgs: readonly T[]): string {
  let out = "";
  for (const m of msgs) {
    const text = (m.content ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!text) continue;
    const line = `[${m.role}] ${text}\n`;
    if (out.length + line.length > 800) break;
    out += line;
  }
  return out.trim();
}

/** A thread's pinned compaction summary plus the count of history messages it
 *  covers. The lead rides in the payload only while fitToContext drops. */
export type PinnedSummary = { summary: string; covered: number };

/** Summary pinning (cache-hit rule): reuse the stored entry until the dropped
 *  prefix grows past twice what the entry covers, then regenerate over the
 *  full dropped prefix. Keeps the payload prefix byte-stable between runs so
 *  the provider's prompt cache (cached_prompt pricing on the router) can hit. */
export function pinSummary(
  entry: PinnedSummary | undefined,
  dropped: ReadonlyArray<{ role: string; content: string | null }>,
): PinnedSummary {
  if (entry && entry.covered > 0 && dropped.length <= entry.covered * 2)
    return entry;
  return { summary: summarizeConversation(dropped), covered: dropped.length };
}
