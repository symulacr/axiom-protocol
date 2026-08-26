/*
  chat/lib — pure utilities extracted from the ChatPage monolith (item-5
  split). Zero React, zero hooks: every function here is deterministic and
  unit-testable. Types moved with their functions; ChatPage re-imports.
*/
import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  humanizeError,
  truncateHex,
  truncateAddress,
} from "../utils/format.js";

export type Message = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
  /** meta.error = UI-only error card (never sent to the model); usage = cost chip. */
  meta?: { error?: boolean; usage?: string };
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type SSEChunk = {
  choices?: Array<{
    delta: {
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: "function";
        function?: { name?: string; arguments?: string };
      }>;
      role?: string;
    };
    finish_reason?: string | null;
  }>;
  /** Backend metadata frame ({type:"trace",trace}); mid-stream error frames may also arrive with code (STREAM_ERROR). */
  type?: string;
  trace?: Record<string, unknown>;
  error?: string;
  code?: string;
  /** Router usage on the terminal/finish_reason chunk body. */
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
  /** Router x_0g_trace on the terminal chunk body. */
  x_0g_trace?: {
    provider?: string;
    request_id?: string;
    billing?: {
      total_cost?: string;
    };
  };
};

export type TurnMetric = {
  wallMs: number;
  ttftMs?: number;
  provider?: string;
  costNeuron?: number;
};

export function createMessage(msg: Omit<Message, "id">): Message {
  return { ...msg, id: crypto.randomUUID() };
}

export function toMessages(msgs: unknown[]): Message[] {
  return (msgs as Message[]).map((m) =>
    m && typeof m.id === "string" ? m : { ...m, id: crypto.randomUUID() },
  );
}

export function loadJsonArray<T>(storage: Storage, key: string): T[] {
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function titleFromMessages(msgs: Message[], untitled: string): string {
  const first = msgs.find((m) => m.role === "user" && m.content);
  const t = (first?.content ?? untitled).trim().replace(/\s+/g, " ");
  return t.length > 42 ? `${t.slice(0, 42)}…` : t || untitled;
}

export function consumeSseLines(buffer: string): {
  chunks: SSEChunk[];
  rest: string;
  done: boolean;
} {
  const chunks: SSEChunk[] = [];
  let done = false;
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6).trim();
    if (payload === "[DONE]") {
      done = true;
      break;
    }
    try {
      chunks.push(JSON.parse(payload) as SSEChunk);
    } catch {
      void 0;
    }
  }
  return { chunks, rest, done };
}

function linkifyConsoleRefs(
  src: string,
  explorerTx: (hash: string) => string,
): string {
  return src
    .replace(/Agent #(\d+)/g, "[Agent #$1](/agents/$1)")
    .replace(
      /\b(0x[a-fA-F0-9]{64})\b/g,
      (hash) => `[${truncateHex(hash, 6, 4)}](${explorerTx(hash)})`,
    );
}

export function renderMarkdown(
  src: string | null,
  explorerTx?: (hash: string) => string,
): string {
  const linked =
    explorerTx !== undefined
      ? linkifyConsoleRefs(src ?? "", explorerTx)
      : (src ?? "");
  return DOMPurify.sanitize(
    marked.parse(linked, {
      async: false,
      gfm: true,
      breaks: false,
    }) as string,
    { FORBID_TAGS: ["style", "iframe"] },
  );
}

export const dedupeToolCalls = (calls: ToolCall[]): ToolCall[] =>
  calls.filter(
    (c, i) =>
      calls.findIndex(
        (x) =>
          x.function.name === c.function.name &&
          x.function.arguments === c.function.arguments,
      ) === i,
  );

/** 04: tool failures render humanized in the message stream —
 * the model still receives the raw result JSON (it recovers better with
 * real detail); users get the head sentence, never a viem/backend dump. */
export function humanizeToolMessage(text: string): string {
  return text.startsWith("Error: ") ? humanizeError(text) : text;
}

/** Capture router trace (terminal chunk or backend trace frame) into a
 * per-turn metric record. Token/cache counts stay wire-only — deliberately
 * not captured or shown (row 42, audit 07). */
export function captureTurnMetrics(
  turn: TurnMetric,
  _usage: SSEChunk["usage"],
  trace: Record<string, unknown> | undefined,
): void {
  if (!trace) return;
  if (typeof trace.provider === "string") turn.provider = trace.provider;
  const billing = trace.billing as { total_cost?: string } | undefined;
  if (billing?.total_cost !== undefined) {
    const n = Number(billing.total_cost);
    if (Number.isFinite(n)) turn.costNeuron = (turn.costNeuron ?? 0) + n;
  }
}

function formatNeuron(neuron: number): string {
  const og = neuron / 1e18;
  if (og >= 1) return og.toFixed(3);
  return og.toPrecision(2);
}

/** Aggregated per-run insights line: 'N turns · N steps | LLM Xs | provider
 * 0x… | ≈X <native>'. Rendered inside InsightsDisclosure (collapsed by
 * default); the cost unit is the chain's native symbol (never a literal,
 * ). Token/cache internals are deliberately not shown (row 42, audit 07). */
export function formatInsightsLine(
  metrics: TurnMetric[],
  turns: number,
  steps: number,
  nativeSymbol: string,
): string | undefined {
  if (metrics.length === 0) return undefined;
  const parts = [
    `${turns} turn${turns === 1 ? "" : "s"} · ${steps} step${steps === 1 ? "" : "s"}`,
  ];
  const wallMs = metrics.reduce((a, m) => a + m.wallMs, 0);
  if (wallMs > 0) parts.push(`LLM ${(wallMs / 1000).toFixed(1)}s`);
  // U15: first-token latency lives here (insights), never in the loading UI.
  const first = metrics[0];
  if (first?.ttftMs && first.ttftMs > 0) {
    parts.push(`TTFT ${(first.ttftMs / 1000).toFixed(1)}s`);
  }
  // Row-42: opened detail keeps 3 segments (cost, latency, provider); internals stay out of the collapsed line.
  const last = metrics[metrics.length - 1];
  if (last?.provider) parts.push(`provider ${truncateAddress(last.provider)}`);
  const cost = metrics.reduce((a, m) => a + (m.costNeuron ?? 0), 0);
  if (cost > 0) parts.push(`≈${formatNeuron(cost)} ${nativeSymbol}`);
  return parts.join(" | ");
}

/** Parse an LLM tool-call's `arguments` payload. Models occasionally emit two
 * concatenated JSON objects or append prose after the first one; salvage the
 * first balanced {...} block instead of failing the whole tool call. */
export function parseToolArguments(
  raw: string | undefined,
): Record<string, unknown> {
  const s = raw?.trim() || "{}";
  try {
    const parsed: unknown = JSON.parse(s);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    /* fall through to salvage */
  }
  const start = s.indexOf("{");
  if (start === -1) return {};
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(s.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return {};
        }
      }
    }
  }
  return {};
}
