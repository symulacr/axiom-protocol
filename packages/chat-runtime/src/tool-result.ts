import type { ToolResult } from "./types.js";

export function success(obj: Record<string, unknown>): ToolResult {
  return { ok: true, content: JSON.stringify(obj) };
}

export function fail(message: string): ToolResult {
  return { ok: false, content: JSON.stringify({ error: message }) };
}
