import { resolveChatModel } from "@axiom/config";

// Default to SAME-ORIGIN proxy paths. The production static servers proxy
// these to the backend / oracle:
//   - Railway: apps/frontend/server.mjs  (/api -> backend, /oracle -> oracle)
//   - Vercel:  vercel.json rewrites         (/api -> backend, /oracle -> oracle)
// Talking only to our own origin removes CORS/auth friction and means the
// browser never falls back to a hardcoded localhost URL (which previously
// pointed the oracle at the wrong port, 3001 instead of 8787, and left
// the app unable to reach the services in production).
//
// Override per-deploy with the VITE_BACKEND_URL / VITE_ORACLE_URL build env
// vars ONLY if you want the browser to call the services directly (you must
// then also allow the frontend origin in each service's CORS / CSP config).
export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ?? "/api";

export const API_KEY = import.meta.env.VITE_API_KEY ?? "";

export const ORACLE_URL =
  import.meta.env.VITE_ORACLE_URL ?? "/oracle";

export const CHAT_MODEL = resolveChatModel(import.meta.env.VITE_CHAT_MODEL);

// Resolve the WebSocket base (ws:// or wss://) for the event stream.
// Works for both a relative same-origin base (/api) and an absolute backend
// URL (https://backend...). Relative bases derive the host + scheme from the
// current page so we never produce an invalid URL like "ws:///api/...".
export function backendWsBase(): string {
  if (BACKEND_URL.startsWith("/")) {
    const proto =
      typeof window !== "undefined" ? window.location.protocol : "http:";
    const scheme = proto === "https:" ? "wss" : "ws";
    const host =
      typeof window !== "undefined" ? window.location.host : "127.0.0.1:3000";
    return `${scheme}://${host}`;
  }
  const scheme = BACKEND_URL.startsWith("https://") ? "wss" : "ws";
  const host = BACKEND_URL.replace(/^https?:\/\//, "");
  return `${scheme}://${host}`;
}

// When BACKEND_URL is relative we must append it as a path prefix; when it is
// absolute it already contains the host and needs no extra prefix.
export function backendWsPathPrefix(): string {
  return BACKEND_URL.startsWith("/") ? BACKEND_URL : "";
}
