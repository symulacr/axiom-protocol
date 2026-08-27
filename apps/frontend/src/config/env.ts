import { resolveChatModel } from "@axiom/config/chat-tools";
const DEFAULT_WS_HOST = "127.0.0.1:3000";

// Same-origin proxy paths (/api, /oracle) dodge CORS/auth friction; a localhost
// fallback once hit the wrong port (3001 vs 8787), so override only via VITE_* build env + CORS config.
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "/api";

export const API_KEY = import.meta.env.VITE_API_KEY ?? "";

export const ORACLE_URL = import.meta.env.VITE_ORACLE_URL ?? "/oracle";

// Chain-aware: an unset VITE_CHAT_MODEL follows the chain default
// (VITE_CHAIN_ID), so a testnet build never pins a mainnet-only model id.
export const CHAT_MODEL = resolveChatModel(
  import.meta.env.VITE_CHAT_MODEL,
  Number(import.meta.env.VITE_CHAIN_ID) || undefined,
);

// ws/wss base; relative /api derives host+scheme from the page so we never emit "ws:///api/..."
function backendWsBase(): string {
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

// Single shared WS handshake for event streams and orchestrator tick streams:
// backend /v1/stream endpoint + topic(s). Auth is dual-path:
// - PREFERRED: token rides the Sec-WebSocket-Protocol subprotocol header
// (["axiom", btoa(token)]) so it never leaks into URLs/logs.
// - FALLBACK: legacy ?token= query param, still required by current backends.
// A subprotocol-bearing handshake against a backend that only knows ?token=
// fails the WS open (negotiation mismatch) exactly once; callers retry via
// openStreamSocket() with the query fallback. Header failures are counted, not
// latched: a transient blip must not demote auth for the whole session — only
// a header SUCCESS resets the counter (query-only backends reach steady state
// after ≤2 extra handshakes).
const WS_AUTH_SUBPROTOCOL = "axiom";

const MAX_HEADER_AUTH_FAILURES = 2;
let wsAuthHeaderFailures = 0;
let wsAuthHeaderProven = false;

function wsTokenSubprotocols(token: string): string[] | undefined {
  if (!token) return undefined;
  try {
    // btoa on a token charset (hex/alnum) never throws; guard anyway for
    // non-ASCII keys where base64 would still be lossless but let's be safe.
    return [WS_AUTH_SUBPROTOCOL, btoa(token)];
  } catch {
    return undefined;
  }
}

function buildStreamWsUrl(
  topics: string | string[],
  opts: { token?: boolean } = {},
): string {
  const prefix = BACKEND_URL.startsWith("/") ? BACKEND_URL : "";
  const base = `${backendWsBase()}${prefix}/v1/stream`;
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error(`Invalid stream base URL: ${base}`);
  }
  const list = Array.isArray(topics) ? topics : [topics];
  for (const t of list) url.searchParams.append("topic", t);
  // Query token stays the guaranteed-compatible path; suppressed once the
  // header path is proven supported (or forced off via VITE_WS_AUTH=query).
  // "auto" (documented in env.d.ts) is the default branch: header once
  // proven, query until then.
  const mode =
    import.meta.env.VITE_WS_AUTH === "header"
      ? "header"
      : import.meta.env.VITE_WS_AUTH === "query"
        ? "query"
        : wsAuthHeaderProven
          ? "header"
          : "query";
  // Empty API_KEY must not produce a meaningless `token=` param.
  if (opts.token !== false && mode === "query" && API_KEY) {
    url.searchParams.append("token", API_KEY);
  }
  return url.toString();
}

/**
 * Open a /v1/stream WebSocket with dual-path auth. First attempt carries the
 * token in Sec-WebSocket-Protocol; on handshake failure it retries once with
 * the legacy ?token= URL (and remembers which path the backend supports).
 */
export function openStreamSocket(
  topics: string | string[],
): Promise<WebSocket> {
  const headerUrl = buildStreamWsUrl(topics, { token: false });
  const queryUrl = buildStreamWsUrl(topics);
  const protocols = wsTokenSubprotocols(API_KEY);

  const tryOpen = (url: string, protos?: string[]): Promise<WebSocket> =>
    new Promise((resolve, reject) => {
      const ws = protos ? new WebSocket(url, protos) : new WebSocket(url);
      const fail = (err: Error) => {
        ws.onopen = ws.onerror = ws.onclose = null;
        try {
          ws.close();
        } catch {
          /* already closed */
        }
        reject(err);
      };
      ws.onopen = () => {
        ws.onopen = ws.onerror = null;
        ws.onclose = null;
        resolve(ws);
      };
      ws.onerror = () => fail(new Error("WS handshake failed"));
      ws.onclose = () => fail(new Error("WS connection closed"));
    });

  return (async () => {
    // No API key at all: the backend fails upgrades closed (missing token →
    // 401), so neither path can succeed. Throw a typed error the consumer
    // (useEventStream) recognizes and stops on, instead of looping forever.
    if (!API_KEY) {
      throw new Error("WS auth unavailable: no API key configured");
    }
    // Try the header path while under the failure budget (or forced header).
    if (
      protocols &&
      (wsAuthHeaderProven || wsAuthHeaderFailures < MAX_HEADER_AUTH_FAILURES)
    ) {
      try {
        const ws = await tryOpen(headerUrl, protocols);
        wsAuthHeaderProven = true;
        wsAuthHeaderFailures = 0;
        return ws;
      } catch {
        wsAuthHeaderFailures++;
      }
    }
    return tryOpen(queryUrl);
  })();
}
