// Shared HTTP/infra helpers: response envelope, TTL cache, JSON fetch (merged into one module for LOC).
export class TTLCache<T> {
  private readonly cache = new Map<string, { data: T; timestamp: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 5000,
  ) {}

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp >= this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key: string, data: T): void {
    if (this.cache.has(key)) this.cache.delete(key);
    this.cache.set(key, { data, timestamp: Date.now() });
    if (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }
}

import type { Response } from "express";

export function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function sendError(
  res: Response,
  status: number,
  message: string,
  code?: string,
): void {
  const body: { error: string; code?: string; requestId?: string } = {
    error: message,
  };
  if (code !== undefined) body.code = code;
  const requestId = (res.locals as { requestId?: string }).requestId;
  if (requestId !== undefined) body.requestId = requestId;
  res.status(status).json(body);
}

interface FetchJsonResult<T> {
	ok: boolean;
	status: number;
	data: T;
}

export async function fetchJson<T>(
	url: string,
	init?: RequestInit,
): Promise<FetchJsonResult<T>> {
	const res = await fetch(url, init);
	const text = await res.text();

	let data: T;
	try {
		data = (text ? JSON.parse(text) : {}) as T;
	} catch {
		throw new Error(
			`fetchJson: invalid JSON from ${url} (status ${res.status})`,
		);
	}

	return { ok: res.ok, status: res.status, data };
}
