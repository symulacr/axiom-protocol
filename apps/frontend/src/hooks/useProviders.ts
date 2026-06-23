// Axiom Protocol — `useProviders` polling hook.
//
// Polls `GET /v1/compute/providers` every 30 s and returns the
// provider list plus loading/error/refetch state. Uses native fetch
// + useState rather than TanStack Query to stay consistent with the
// rest of the frontend.

import { useCallback, useEffect, useState } from 'react';

/**
 * One compute provider entry returned by the backend's
 * `GET /v1/compute/providers` endpoint. Mirrors the shape produced by
 * `apps/backend/src/compute/router.ts` `getComputeBaseUrl()`.
 */
export type Provider = {
  /** EOA / contract address of the provider. */
  address: `0x${string}`;
  /** Model id (e.g. `qwen/qwen-2.5-7b-instruct`). */
  model: string;
  /** OpenAI-compatible base URL exposed by the provider's broker. */
  endpoint: string;
};

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:3000';

/** Polling interval (ms) — 30 s, per the assignment. */
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
  // Tick counter — bumping it forces the polling effect to re-run, which
  // is how the `refetch` handle exposed to callers requests an immediate
  // re-poll without waiting for the next 30 s tick.
  const [pollTick, setPollTick] = useState<number>(0);

  const refetch = useCallback((): void => {
    setPollTick((n) => n + 1);
  }, []);

  useEffect(() => {
    // `let cancelled` + the cleanup function is the React 18 idiom for
    // ignoring the result of a fetch that was in flight when the component
    // unmounted (or when `pollTick` flipped and re-ran the effect). Source:
    // https://react.dev/reference/react/useEffect#cleanup
    let cancelled = false;

    const load = async (): Promise<void> => {
      try {
        const res = await fetch(`${BACKEND_URL}/v1/compute/providers`, {
          method: 'GET',
          headers: { accept: 'application/json' },
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

    void load();
    const id = setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);

    return (): void => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollTick]);

  return { providers, isLoading, error, refetch };
}
