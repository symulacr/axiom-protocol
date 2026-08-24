import { API_KEY, BACKEND_URL, ORACLE_URL } from "../config/env.js";

function agentPath(id: bigint | string, resource?: string): string {
  const base = `/v1/agents/${id.toString()}`;
  return resource ? `${base}/${resource}` : base;
}

export function agentTransferPath(id: bigint | string): string {
  return agentPath(id, "transfer");
}

export function agentEarningsPath(id: bigint | string): string {
  return agentPath(id, "earnings");
}

const DEFAULT_TIMEOUT = 10_000;
export const LONG_TIMEOUT = 60_000;
export const STREAM_TIMEOUT = 120_000;

export type EncodeResponse = {
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
};

/** Shared auth header for backend/oracle calls; no-op when no API key is configured. */
export function apiKeyHeader(): Record<string, string> {
  return API_KEY ? { "x-api-key": API_KEY } : {};
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true; // TypeError is what browsers throw for failed fetch — treat as network error
  if (err instanceof DOMException && err.name === "AbortError") return false;
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("load failed") ||
    msg.includes("network request failed")
  );
}

class NetworkError extends Error {
  constructor(message: string, originalError?: unknown) {
    super(message, originalError ? { cause: originalError } : undefined);
    this.name = "NetworkError";
  }
}

function withTimeout(init: RequestInit, timeout: number): RequestInit {
  const timeoutSignal = AbortSignal.timeout(timeout);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;
  return { ...init, signal };
}

type HttpError = Error & {
  retryAfter?: number;
  code?: string;
  requestId?: string;
};

type ErrorBody = { error?: string; code?: string; requestId?: string } | null;

/** Correlation refs ride every HTTP error variant unchanged. */
function attachRefs(err: HttpError, parsed: ErrorBody): HttpError {
  if (parsed?.code !== undefined) err.code = parsed.code;
  if (parsed?.requestId !== undefined) err.requestId = parsed.requestId;
  return err;
}

async function buildHttpError(path: string, res: Response): Promise<HttpError> {
  const text = await res.text();
  let parsed: ErrorBody = null;
  try {
    const j: unknown = JSON.parse(text); // empty text throws → stays null
    parsed = j && typeof j === "object" ? (j as ErrorBody) : null;
  } catch {
    parsed = null;
  }
  if (res.status === 401 || res.status === 403) {
    return attachRefs(
      new Error(
        "Session expired or unauthorized — reconnect your wallet.",
      ) as HttpError,
      parsed,
    );
  }
  if (res.status === 429) {
    const raw = res.headers.get("Retry-After");
    const parsedSecs = raw ? Number(raw) : NaN;
    const secs =
      Number.isFinite(parsedSecs) && parsedSecs > 0 ? parsedSecs : 30;
    const err = attachRefs(
      new Error(`Rate limited — retry in ${secs}s.`) as HttpError,
      parsed,
    );
    err.retryAfter = secs;
    return err;
  }
  const message =
    parsed?.error ??
    `${path} failed: ${res.status} ${res.statusText}${text ? `: ${text}` : ""}`;
  return attachRefs(new Error(message) as HttpError, parsed);
}

function wrapFetchError(err: unknown): never {
  if (err instanceof DOMException && err.name === "AbortError") throw err;
  if (err instanceof DOMException && err.name === "TimeoutError") {
    throw new NetworkError(
      "Request timed out. The server may be busy — please try again.",
      err,
    );
  }
  if (isNetworkError(err)) {
    throw new NetworkError(
      "Network error — check your internet connection and try again.",
      err,
    );
  }
  throw err;
}

function requestWithHeaders(
  init: RequestInit,
  timeout: number,
  acceptJson: boolean,
): RequestInit {
  return withTimeout(
    {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(acceptJson ? { accept: "application/json" } : {}),
        ...apiKeyHeader(),
        ...((init.headers as Record<string, string>) ?? {}),
      },
    },
    timeout,
  );
}

async function apiFetchFrom<T>(
  baseUrl: string,
  path: string,
  init: RequestInit & { timeout?: number; retries?: number } = {},
): Promise<T> {
  const timeout = init.timeout ?? DEFAULT_TIMEOUT;
  const method = (init.method ?? "GET").toUpperCase();
  const maxRetries = init.retries ?? (method === "GET" ? 1 : 0);

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(
        `${baseUrl.replace(/\/$/, "")}${path}`,
        requestWithHeaders(init, timeout, true),
      );
      if (!res.ok) throw await buildHttpError(path, res);
      return res.json() as Promise<T>;
    } catch (err) {
      lastError = err;
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      const retryAfter = (err as HttpError)?.retryAfter;
      if (
        retryAfter !== undefined &&
        method === "GET" &&
        attempt < maxRetries
      ) {
        await delay(retryAfter * 1000);
        continue;
      }
      if (isNetworkError(err) && attempt < maxRetries) {
        const backoff = Math.min(1000 * 2 ** attempt, 4000);
        await delay(backoff);
        continue;
      }
      wrapFetchError(err);
    }
  }

  throw lastError;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { timeout?: number; retries?: number } = {},
): Promise<T> {
  return apiFetchFrom<T>(BACKEND_URL, path, init);
}

async function apiFetchResponse(
  path: string,
  init: RequestInit & { timeout?: number } = {},
): Promise<Response> {
  const timeout = init.timeout ?? DEFAULT_TIMEOUT;
  try {
    const res = await fetch(
      `${BACKEND_URL}${path}`,
      requestWithHeaders(init, timeout, false),
    );
    if (!res.ok) throw await buildHttpError(path, res);
    return res;
  } catch (err) {
    wrapFetchError(err);
  }
}

/** Streaming POST (SSE chat): honors Retry-After with up to 2 retries capped
 * at 10s each. AbortError propagates immediately — a user-initiated cancel
 * must never be retried. */
export async function postStreamingWithRetry(
  path: string,
  init: RequestInit & { timeout?: number },
): Promise<Response> {
  let attempt = 0;
  for (;;) {
    try {
      return await apiFetchResponse(path, init);
    } catch (err) {
      const retryAfter = (err as { retryAfter?: number })?.retryAfter;
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      if (retryAfter === undefined || attempt >= 2) throw err;
      attempt++;
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 10) * 1000));
    }
  }
}

export async function oracleFetch<T>(
  path: string,
  init: RequestInit & { timeout?: number } = {},
): Promise<T> {
  return apiFetchFrom<T>(ORACLE_URL, path, init);
}
