import { useCallback, useEffect, useRef, useState } from 'react';
import { BACKEND_URL } from '../config/env.js';

export type Provider = {
  address: `0x${string}`;
  model: string;
  endpoint: string;
};

const POLL_INTERVAL_MS = 30_000;

export function useProviders(): {
  providers: Provider[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [pollTick, setPollTick] = useState<number>(0);
  const abortRef = useRef<AbortController | null>(null);

  const refetch = useCallback((): void => {
    setPollTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`${BACKEND_URL}/v1/compute/providers`, {
          method: 'GET',
          headers: { accept: 'application/json' },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(
            `providers fetch failed: ${res.status} ${res.statusText} ${text}`,
          );
        }
        const { services } = (await res.json()) as { services: Provider[] };
        if (cancelled) return;
        setProviders(services);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    async function schedule() {
      await load();
      if (!cancelled) {
        timer = setTimeout(schedule, POLL_INTERVAL_MS);
      }
    }
    let timer: ReturnType<typeof setTimeout>;
    void schedule();

    return (): void => {
      cancelled = true;
      abortRef.current?.abort();
      clearTimeout(timer);
    };
  }, [pollTick]);

  return { providers, isLoading, error, refetch };
}
