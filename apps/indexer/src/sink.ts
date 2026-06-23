// apps/indexer/src/sink.ts
//
// HTTP event sink for the indexer. Forwards decoded AxiomEvents to
// the backend's POST /v1/events endpoint for the dashboard activity panel.

import type { AxiomEvent } from "./events.js";
import { GALILEO_CHAIN_ID } from "@axiom/config/networks";

/**
 * Shape of the JSON body posted to the backend. Mirrors
 * `StoredEvent` in apps/backend/src/events/store.ts — keep both in sync.
 */
export interface HttpEventBody {
  source: string;
  chainId: number;
  blockNumber: number;
  txHash: string;
  logIndex: number;
  eventName: string;
  payload: Record<string, unknown>;
}

/** Minimal `fetch`-compatible function; defaults to the global `fetch`. */
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** Options accepted by `postEvent` and `httpEventSink`. */
export interface HttpEventSinkOptions {
  /** Base URL of the backend, e.g. `http://127.0.0.1:3000`. */
  backendUrl: string;
  /**
   * Override the underlying `fetch`. Useful for unit tests that want
   * to assert on the outbound request without a real network call.
   * Defaults to the global `fetch` (Node 22+).
   */
  fetcher?: Fetcher;
  /**
   * Logical source tag sent to the backend. The backend stores events
   * bucketed by this string; default `"indexer"` matches the brief.
   */
  source?: string;
  /**
   * Optional per-request timeout in ms. When set, the request is raced
   * against an AbortController so a slow backend cannot stall the
   * indexer poll loop. Default: 5_000.
   */
  timeoutMs?: number;
}

/** Returned by `postEvent` / `httpEventSink`'s sink so callers can
 *  log / metric the result. */
export interface HttpEventSinkResult {
  status: number;
}

/** Resolve the URL once and strip the trailing slash. */
function resolveUrl(backendUrl: string) {
  return `${backendUrl.replace(/\/+$/, "")}/v1/events`;
}

/**
 * Build the wire body for one event. Lifts the shared `BaseFields`
 * (blockNumber / txHash / logIndex) to the top level and keeps the
 * event-specific fields in `payload`. The event's `kind` becomes
 * `eventName`.
 */
function buildBody(event: AxiomEvent, source: string, chainId: number): HttpEventBody {
  const { blockNumber, txHash, logIndex, kind: eventName, ...rest } =
    event as AxiomEvent & { kind: string };
  return {
    source,
    chainId,
    blockNumber,
    txHash,
    logIndex,
    eventName,
    payload: rest as Record<string, unknown>,
  };
}

/**
 * POST a single event to the backend. Returns the HTTP status; throws
 * on network error / abort.
 */
export async function postEvent(
  event: AxiomEvent,
  opts: HttpEventSinkOptions,
) {
  const fetchImpl: Fetcher = opts.fetcher ?? ((u, i) => fetch(u, i));
  const source = opts.source ?? "indexer";
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const url = resolveUrl(opts.backendUrl);

  // Re-read the env at call time so operators can rotate the chain id
  // between runs without restarting the indexer process. 0G Galileo
  // (testnet) is 16602; mainnet "Aristotle" is 16661.
  const chainId = Number(process.env["OG_CHAIN_ID"] ?? GALILEO_CHAIN_ID);
  const body: HttpEventBody = buildBody(event, source, chainId);

  // AbortSignal.timeout is safe in Node 22+.
  const signal = AbortSignal.timeout(timeoutMs);
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // body is a string so fetch does not need a Blob polyfill in Node.
    // The replacer converts every bigint to its decimal string form;
    // per ECMA-262, JSON.stringify has no native BigInt path, so the
    // replacer is required for fields like `tokenId` / `amount`.
    body: JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    signal,
  });
  return { status: res.status };
}

/**
 * Build a sink closure that POSTs each event to `${backendUrl}/v1/events`
 * and returns the response status. Matches the brief's signature:
 *   `httpEventSink({ backendUrl, fetcher? }): (event) => Promise<{ status: number }>`
 *
 * The returned closure captures the `opts` so a single factory call
 * can be reused across many events without re-binding. Callers that
 * need the raw status (e.g. for metrics) should use `postEvent` directly.
 */
export function httpEventSink(opts: HttpEventSinkOptions) {
  return (event: AxiomEvent) => postEvent(event, opts);
}
