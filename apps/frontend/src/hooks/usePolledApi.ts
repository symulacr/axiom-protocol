import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../utils/apiFetch.js';

export interface PolledApiOptions {
  refetchInterval?: number;
  enabled?: boolean;
  signal?: AbortSignal;
  queryKey?: readonly unknown[];
}

/**
 * Polled HTTP fetch backed by `@tanstack/react-query`.
 *
 * Accept a static URL **string** or a **getter function** (for dynamic URLs,
 * e.g. cursor-based incremental polling). When a getter is used you **must**
 * supply a stable `queryKey` so that the query identity doesn't change on
 * every render.
 *
 * @example
 *   // static URL — simplest case
 *   usePolledApi<{ services: Provider[] }>('/v1/compute/providers', { refetchInterval: 30_000 })
 *
 * @example
 *   // getter function + explicit queryKey (incremental / cursor polling)
 *   usePolledApi<EventsResponse>(() => `/v1/events?since=${cursorRef.current}`, {
 *     queryKey: ['events', { owner }],
 *     refetchInterval: 15_000,
 *   })
 */
export function usePolledApi<T>(
  urlOrGetter: string | (() => string),
  options: PolledApiOptions = {},
) {
  const { refetchInterval = 30000, enabled = true, signal: externalSignal } = options;

  // Always keep the freshest url/getter in a ref so queryFn reads
  // the latest value without causing the query key to change.
  const getterRef = useRef(urlOrGetter);
  getterRef.current = urlOrGetter;

  const defaultKey: readonly unknown[] =
    typeof urlOrGetter === 'string' ? [urlOrGetter] : ['polled-api'];

  return useQuery<T, Error>({
    queryKey: options.queryKey ?? defaultKey,
    queryFn: async ({ signal: querySignal }) => {
      const url =
        typeof getterRef.current === 'function'
          ? getterRef.current()
          : getterRef.current;
      const combined = externalSignal
        ? AbortSignal.any([externalSignal, querySignal])
        : querySignal;
      return apiFetch<T>(url, { signal: combined });
    },
    refetchInterval,
    enabled,
    staleTime: refetchInterval * 0.8,
    retry: 2,
  });
}
