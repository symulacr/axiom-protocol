import type { AxiomEvent } from "./events.js";
import { ARISTOTLE_CHAIN_ID } from "@axiom/config/networks";
import { bigintReplacer } from "@axiom/config/types/bigint";

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
  chainId?: number;
  apiKey?: string;
  indexerKey?: string;
  maxRetries?: number;
}

function resolveUrl(backendUrl: string) {
  return `${backendUrl.replace(/\/+$/, "")}/v1/events`;
}

function buildBody(
  event: AxiomEvent,
  source: string,
  chainId: number,
): HttpEventBody {
  const {
    blockNumber,
    txHash,
    logIndex,
    kind: eventName,
    ...rest
  } = event as AxiomEvent & { kind: string };
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

export async function postEvent(event: AxiomEvent, opts: HttpEventSinkOptions) {
  const fetchImpl: Fetcher = opts.fetcher ?? ((u, i) => fetch(u, i));
  const source = opts.source ?? "indexer";
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const url = resolveUrl(opts.backendUrl);
  const maxRetries = opts.maxRetries ?? 2;

  const chainId =
    opts.chainId ??
    Number(
      process.env["AXIOM_CHAIN_ID"] ??
        process.env["OG_CHAIN_ID"] ??
        ARISTOTLE_CHAIN_ID,
    );
  const body: HttpEventBody = buildBody(event, source, chainId);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const signal = AbortSignal.timeout(timeoutMs);
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (opts.apiKey) headers["x-api-key"] = opts.apiKey;
      if (opts.indexerKey) headers["x-indexer-key"] = opts.indexerKey;
      const res = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body, bigintReplacer),
        signal,
      });
      if (res.status < 500 || attempt === maxRetries) {
        return { status: res.status };
      }
    } catch (err) {
      if (attempt === maxRetries) throw err;
    }
    await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
  }
  return { status: 500 };
}
