// Axiom Protocol — `useProviders` polling hook.
//
// Typed React hook that polls the backend's `GET /v1/compute/providers`
// endpoint every 30 seconds and returns the current provider list plus
// loading / error / refetch state.
//
// Why poll instead of `useQuery`?
//   - The rest of the Axiom frontend (see `useOrchestratorTick.ts`,
//     `useAgentMetadata.ts`) uses the native Fetch API + `useState` pattern
//     rather than TanStack Query so the project stays free of any query
//     cache invariants. We follow the same convention here.
//
// Backend base URL is read from Vite's `VITE_BACKEND_URL` env var (the
// `VITE_` prefix is the Vite convention for browser-visible vars;
// https://vitejs.dev/guide/env-and-mode). It falls back to the local
// dev loopback used by `apps/backend` (`pnpm dev` → :3000).
//
// Canonical references:
//  - MDN — Fetch API: Request/Response, JSON body, error handling:
//    https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
//  - React — useEffect (mount + cleanup), useState, useCallback:
//    https://react.dev/reference/react/useEffect
//  - React — useEffect cleanup functions (clear setInterval to stop the
//    poll when the component unmounts):
//    https://react.dev/reference/react/useEffect#cleanup
//  - Vite environment variables (VITE_ prefix):
//    https://vitejs.dev/guide/env-and-mode

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
