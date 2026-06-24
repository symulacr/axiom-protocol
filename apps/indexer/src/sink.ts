// Posts decoded AxiomEvents to the backend's POST /v1/events.

import type { AxiomEvent } from "./events.js";
import { GALILEO_CHAIN_ID } from "@axiom/config/networks";

/**
 * Shape of the JSON body posted to the backend.
 * Mirrors StoredEvent in backend/src/events/store.ts.
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

/** Minimal fetch-compatible function; defaults to global fetch. */
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** Options for postEvent. */
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
   * Source tag sent to backend; default "indexer".
   */
  source?: string;
  /**
   * Per-request timeout ms. Default: 5_000.
   */
  timeoutMs?: number;
}

/** Returned by postEvent. */
export interface HttpEventSinkResult {
  status: number;
}

/** Resolve the URL once and strip the trailing slash. */
function resolveUrl(backendUrl: string) {
  return `${backendUrl.replace(/\/+$/, "")}/v1/events`;
}

/**
 * Build the wire body for one event. The event's kind becomes eventName;
 * remaining fields go in payload.
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
 * POST a single event to the backend. Returns HTTP status; throws
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

  // Re-read env at call time so chain id can be rotated without restart.
  // 0G Galileo (testnet) = 16602; mainnet "Aristotle" = 16661.
  const chainId = Number(process.env["OG_CHAIN_ID"] ?? GALILEO_CHAIN_ID);
  const body: HttpEventBody = buildBody(event, source, chainId);

  // AbortSignal.timeout is safe in Node 22+
  const signal = AbortSignal.timeout(timeoutMs);
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // body is a string so fetch doesn't need a Blob polyfill.
    // The replacer converts bigints to decimal strings.
    body: JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    signal,
  });
  return { status: res.status };
}


