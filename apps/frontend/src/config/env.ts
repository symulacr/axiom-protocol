import { resolveChatModel } from "@axiom/config/chat-tools";
const DEFAULT_WS_HOST = "127.0.0.1:3000";

// Same-origin proxy paths (/api, /oracle) dodge CORS/auth friction; a localhost
// fallback once hit the wrong port (3001 vs 8787), so override only via VITE_* build env + CORS config.
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "/api";

export const API_KEY = import.meta.env.VITE_API_KEY ?? "";

export const ORACLE_URL = import.meta.env.VITE_ORACLE_URL ?? "/oracle";

export const CHAT_MODEL = resolveChatModel(import.meta.env.VITE_CHAT_MODEL);

// ws/wss base; relative /api derives host+scheme from the page so we never emit "ws:///api/..."
export function backendWsBase(): string {
  if (BACKEND_URL.startsWith("/")) {
    const proto =
      typeof window !== "undefined" ? window.location.protocol : "http:";
    const scheme = proto === "https:" ? "wss" : "ws";
    const host =
      typeof window !== "undefined" ? window.location.host : DEFAULT_WS_HOST;
    return `${scheme}://${host}`;
  }
  const scheme = BACKEND_URL.startsWith("https://") ? "wss" : "ws";
  const host = BACKEND_URL.replace(/^https?:\/\//, "");
  return `${scheme}://${host}`;
}

export function backendWsPathPrefix(): string {
  return BACKEND_URL.startsWith("/") ? BACKEND_URL : "";
}

// Single shared WS handshake for event streams and orchestrator tick streams:
// backend /v1/stream endpoint + topic(s) + auth token.
export function buildStreamWsUrl(topics: string | string[]): string {
  const url = new URL(`${backendWsBase()}${backendWsPathPrefix()}/v1/stream`);
  const list = Array.isArray(topics) ? topics : [topics];
  for (const t of list) url.searchParams.append("topic", t);
  url.searchParams.append("token", API_KEY);
  return url.toString();
}
