// Axiom Protocol — `useEventHistory` hook.
// Polls GET /v1/events on a fixed cadence and returns the event list.

import { useEffect, useMemo, useState } from 'react';
import { BACKEND_URL } from '../config/env.js';

/**
 * Wire-format event returned by GET /v1/events. Mirrors the
 * `StoredEvent` shape on the backend so the timeline can render
 * the raw payload alongside the on-chain coordinates. Field types
 * match what the backend serialises over JSON: `bigint` is encoded
 * as a decimal `string`, so `blockNumber` is `number` (fits in
 * IEEE-754) and the indexer's `tokenId`/`amount` fields come
 * through the opaque `payload` already stringified.
 */
export interface AxiomEvent {
  source: string;
  chainId: number;
  blockNumber: number;
  txHash: string;
  logIndex: number;
  eventName: string;
  payload: Record<string, unknown>;
  receivedAt: number;
}

/** Shape of the JSON envelope returned by GET /v1/events. */
interface EventsResponse {
  events: AxiomEvent[];
}

/** Public surface of the hook. The grouping is a derived index, not
 *  a separate fetch — the page never has to re-group the data. */
export interface UseEventHistoryResult {
  events: AxiomEvent[];
  byName: Record<string, AxiomEvent[]>;
  isLoading: boolean;
  error: Error | null;
}

/** Options accepted by `useEventHistory`. */
export interface UseEventHistoryOptions {
  /** Poll interval in milliseconds; default 15 000. */
  pollIntervalMs?: number;
  /**
   * Wallet address to scope the listing to. Forwarded as the
   * `?owner=` query parameter so a future backend can filter
   * server-side; the current backend ignores it and returns the
   * full ring. When omitted, the URL has no `?owner=` param.
   */
  owner?: `0x${string}` | undefined;
  /**
   * When `false`, the hook neither fetches on mount nor schedules
   * any polls. Useful for the not-yet-wallet-connected state.
   * Default `true`.
   */
  enabled?: boolean;
}

const DEFAULT_POLL_INTERVAL_MS = 15_000;

/**
 * Group an event list by its `eventName` field. Insertion order
 * follows the first occurrence of each name in the source list
 * so the timeline renders groups in the same order the backend
 * produced them. Returns a fresh object on every call; the hook
 * memoises the result on the `events` reference so unchanged
 * fetches do not invalidate downstream `useMemo` consumers.
 */
function groupByName(events: readonly AxiomEvent[]): Record<string, AxiomEvent[]> {
  const out: Record<string, AxiomEvent[]> = {};
  for (const ev of events) {
    const bucket = out[ev.eventName];
    if (bucket !== undefined) {
      bucket.push(ev);
    } else {
      out[ev.eventName] = [ev];
    }
  }
  return out;
}

/**
 * Polled, grouped event-history state for the connected wallet's
 * activity feed. The hook:
 *
 *   1. Fetches GET /v1/events on mount, sets `isLoading=true`
 *      until the first response lands.
 *   2. Re-fetches every `pollIntervalMs` (default 15s).
 *   3. Cancels the in-flight request on unmount or when the
 *      `owner` / `enabled` inputs change (abort the previous
 *      AbortController, install a fresh one for the next tick).
 *   4. Surfaces the latest network error in `error`; the polling
 *      loop continues on the next tick — a single failure does
 *      not stop the feed.
 */
export function useEventHistory(
  options: UseEventHistoryOptions = {},
): UseEventHistoryResult {
  const { pollIntervalMs, owner, enabled = true } = options;
  const interval = pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  const [events, setEvents] = useState<AxiomEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    // One AbortController per effect run. Cancelled by the cleanup
    // function so the strict-mode double-invoke (and any real
    // dependency change) cannot leak the first request's result
    // into the second's state. Source: https://react.dev/reference/react/useEffect
    const controller = new AbortController();

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const fetchOnce = async (): Promise<void> => {
      try {
        const url = new URL(`${BACKEND_URL}/v1/events`);
        if (owner !== undefined) {
          url.searchParams.set('owner', owner);
        }
        const res = await fetch(url.toString(), {
          method: 'GET',
          headers: { accept: 'application/json' },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        });
        if (!res.ok) {
          // The body may not be JSON; `.text()` is the safe read
          // path so we can include the raw payload in the error.
          const body = await res.text().catch(() => '');
          throw new Error(
            `events fetch failed: ${res.status} ${res.statusText}${body.length > 0 ? ` ${body}` : ''}`,
          );
        }
        const data = (await res.json()) as EventsResponse;
        if (cancelled) {
          return;
        }
        setEvents(Array.isArray(data.events) ? data.events : []);
        setError(null);
      } catch (err) {
        if (cancelled) {
          return;
        }
        // AbortError on unmount — ignore.
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        const wrapped = err instanceof Error ? err : new Error(String(err));
        setError(wrapped);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void fetchOnce();
    timer = setTimeout(function tick() {
      void fetchOnce();
      timer = setTimeout(tick, interval);
    }, interval);

    return (): void => {
      cancelled = true;
      controller.abort();
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [owner, enabled, interval]);

  const byName = useMemo<Record<string, AxiomEvent[]>>(
    () => groupByName(events),
    [events],
  );

  return { events, byName, isLoading, error };
}
