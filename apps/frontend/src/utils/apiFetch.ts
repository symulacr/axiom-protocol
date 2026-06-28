import { BACKEND_URL } from '../config/env.js';

const API_KEY = import.meta.env.VITE_API_KEY ?? '';

export const DEFAULT_TIMEOUT = 10_000;
export const LONG_TIMEOUT = 60_000;  // on-chain tx wait
export const STREAM_TIMEOUT = 120_000; // LLM streaming

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { timeout?: number } = {},
): Promise<T> {
  const timeout = init.timeout ?? DEFAULT_TIMEOUT;
  const timeoutSignal = AbortSignal.timeout(timeout);
  const combinedSignal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;

  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    signal: combinedSignal,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'x-api-key': API_KEY,
      ...(init.headers as Record<string, string> ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `${path} failed: ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`,
    );
  }
  return res.json() as Promise<T>;
}
