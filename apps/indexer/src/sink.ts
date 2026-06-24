import type { AxiomEvent } from "./events.js";
import { GALILEO_CHAIN_ID } from "@axiom/config/networks";

export interface HttpEventBody {
  source: string;
  chainId: number;
  blockNumber: number;
  txHash: string;
  logIndex: number;
  eventName: string;
  payload: Record<string, unknown>;
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpEventSinkOptions {
  backendUrl: string;
  fetcher?: Fetcher;
  source?: string;
  timeoutMs?: number;
}

export interface HttpEventSinkResult {
  status: number;
}

function resolveUrl(backendUrl: string) {
  return `${backendUrl.replace(/\/+$/, "")}/v1/events`;
}

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
    body: JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    signal,
  });
  return { status: res.status };
}


