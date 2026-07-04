import { BACKEND_URL } from "../config/env.js";

const API_KEY = import.meta.env.VITE_API_KEY ?? "";

export const DEFAULT_TIMEOUT = 10_000;
export const LONG_TIMEOUT = 60_000; // on-chain tx wait
export const STREAM_TIMEOUT = 120_000; // LLM streaming

/** Delay utility for retry backoff */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is a network-level failure (offline, DNS, CORS, etc.)
 * as opposed to a server-side HTTP error.
 */
function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true; // "Failed to fetch"
  if (err instanceof DOMException && err.name === "AbortError") return false;
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("load failed") ||
    msg.includes("network request failed")
  );
}

export class NetworkError extends Error {
  constructor(message: string, originalError?: unknown) {
    super(message, originalError ? { cause: originalError } : undefined);
    this.name = "NetworkError";
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { timeout?: number; retries?: number } = {},
): Promise<T> {
  const timeout = init.timeout ?? DEFAULT_TIMEOUT;
  const method = (init.method ?? "GET").toUpperCase();
  // Only retry idempotent reads by default
  const maxRetries = init.retries ?? (method === "GET" ? 1 : 0);

  const timeoutSignal = AbortSignal.timeout(timeout);
  const combinedSignal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${BACKEND_URL}${path}`, {
        ...init,
        signal: combinedSignal,
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-api-key": API_KEY,
          ...((init.headers as Record<string, string>) ?? {}),
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `${path} failed: ${res.status} ${res.statusText}${text ? `: ${text}` : ""}`,
        );
      }
      return res.json() as Promise<T>;
    } catch (err) {
      lastError = err;

      // Never retry user-initiated aborts
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err;
      }

      // Never retry timeout signals (they've already exhausted their budget)
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw new NetworkError(
          "Request timed out. The server may be busy — please try again.",
          err,
        );
      }

      // Retry on network errors with exponential backoff
      if (isNetworkError(err) && attempt < maxRetries) {
        const backoff = Math.min(1000 * 2 ** attempt, 4000);
        await delay(backoff);
        continue;
      }

      // Wrap network errors in a user-friendly class
      if (isNetworkError(err)) {
        throw new NetworkError(
          "Network error — check your internet connection and try again.",
          err,
        );
      }

      throw err;
    }
  }

  throw lastError;
}
