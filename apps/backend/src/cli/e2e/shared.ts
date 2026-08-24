interface ChatCompletionSse {
  chunks: unknown[];
  toolCallSeen: boolean;
  toolNames: string[];
  text: string;
  ttftMs: number;
}

async function readChatCompletionsSse(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  startTime?: number,
): Promise<ChatCompletionSse> {
  const decoder = new TextDecoder();
  let buffer = "";
  const chunks: unknown[] = [];
  let toolCallSeen = false;
  const toolNames: string[] = [];
  let text = "";
  let ttftMs = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") continue;
      try {
        const chunk = JSON.parse(payload) as {
          choices?: Array<{
            delta?: {
              content?: string;
              tool_calls?: Array<{ function?: { name?: string } }>;
            };
          }>;
        };
        chunks.push(chunk);
        const delta = chunk.choices?.[0]?.delta;
        if (
          startTime !== undefined &&
          ttftMs === 0 &&
          (delta?.content || delta?.tool_calls?.length)
        ) {
          ttftMs = Math.round(performance.now() - startTime);
        }
        if (delta?.content) text += delta.content;
        if (delta?.tool_calls?.length) {
          toolCallSeen = true;
          for (const tc of delta.tool_calls) {
            const n = tc.function?.name;
            if (n && !toolNames.includes(n)) toolNames.push(n);
          }
        }
      } catch {
        continue;
      }
    }
  }
  return { chunks, toolCallSeen, toolNames, text, ttftMs };
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx]!;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** x-api-key headers from AXIOM_API_KEY; empty object when unset. */
export function apiKeyHeader(): Record<string, string> {
  const apiKey = process.env.AXIOM_API_KEY ?? "";
  return apiKey ? { "x-api-key": apiKey } : {};
}

interface ChatSseResult {
  chunks: unknown[];
  toolCallSeen: boolean;
  toolNames: string[];
  text: string;
  ttftMs: number;
  ms: number;
}

export async function postChatCompletionsSse(
  backendUrl: string,
  body: unknown,
  opts?: { retries?: number; keepAlive?: boolean },
): Promise<ChatSseResult> {
  const retries = opts?.retries ?? 2;
  const t0 = performance.now();
  let res: Response | undefined;
  let lastErr = "";
  for (let attempt = 0; attempt <= retries; attempt++) {
    res = await fetch(`${backendUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      ...(opts?.keepAlive ? { keepalive: true } : {}),
    });
    if (res.ok) break;
    const text = await res.text();
    lastErr = `chat completions ${res.status}: ${text.slice(0, 200)}`;
    if (res.status === 429 && attempt < retries) {
      await sleep(7_000 * (attempt + 1));
      continue;
    }
    throw new Error(lastErr);
  }
  if (!res?.ok) throw new Error(lastErr || "chat completions failed");
  const reader = res.body?.getReader();
  if (!reader) throw new Error("chat completions: no response body");
  const parsed = await readChatCompletionsSse(reader, t0);
  const ms = Math.round(performance.now() - t0);
  return {
    chunks: parsed.chunks,
    toolCallSeen: parsed.toolCallSeen,
    toolNames: parsed.toolNames,
    text: parsed.text,
    ttftMs: parsed.ttftMs > 0 ? parsed.ttftMs : ms,
    ms,
  };
}
