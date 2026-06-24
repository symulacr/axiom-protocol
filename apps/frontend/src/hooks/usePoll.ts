import { useCallback, useEffect, useRef, useState } from 'react';

export interface UsePollOptions {
  intervalMs: number;
  enabled?: boolean;
}

export function usePoll<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  onResult: (data: T) => void,
  onError: (err: Error) => void,
  options: UsePollOptions,
): { isLoading: boolean; refetch: () => void } {
  const { intervalMs, enabled = true } = options;
  const [isLoading, setIsLoading] = useState(false);
  const [pollTick, setPollTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const fetchOnce = async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsLoading(true);
      try {
        const data = await fetcher(controller.signal);
        if (!cancelled) {
          onResult(data);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!cancelled) {
          onError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void fetchOnce();
    timer = setTimeout(function tick() {
      void fetchOnce();
      timer = setTimeout(tick, intervalMs);
    }, intervalMs);

    return () => {
      cancelled = true;
      abortRef.current?.abort();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [intervalMs, enabled, pollTick, fetcher, onResult, onError]);

  const refetch = useCallback(() => setPollTick((n) => n + 1), []);
  return { isLoading, refetch };
}
