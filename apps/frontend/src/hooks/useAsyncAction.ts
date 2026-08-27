import { useCallback, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";

interface UseAsyncActionResult {
  execute: <U>(fn: (signal: AbortSignal) => Promise<U>) => Promise<U>;
  cancel: () => void;
  isLoading: boolean;
  error: Error | null;
}

// React-query-backed runner keeping the original hook contract byte-equivalent
// (no call site consumes isLoading/error; only execute/cancel are used):
// - AbortController per execute; a new execute aborts the previous one
// - AbortError always THROWS but never sets `error` (also after cancel/unmount)
// - other failures are wrapped in `Error` before being surfaced
// - each call resolves with its own fn's value, even if a newer execute superseded it
export function useAsyncAction(): UseAsyncActionResult {
  // Stable void mutation. In 5.102.x mutateAsync is observer.mutate: it builds
  // a fresh Mutation per call and returns that mutation's raw promise (resolves
  // with the mutationFn value, rejects with its error), so concurrent executes
  // are isolated and every caller keeps its own result.
  const { mutateAsync } = useMutation<
    unknown,
    Error,
    (signal: AbortSignal) => Promise<unknown>
  >({
    mutationFn: (fn) => fn(currentSignalRef.current!),
  });

  // Per-execute signal slot: MutateOptions carries no signal (query-core's
  // retryer never injects one — cancellation is the mutationFn's job), so the
  // controller created in execute is handed to fn through this closure.
  const currentSignalRef = useRef<AbortSignal | null>(null);

  // Keep execute identity stable across mutation-state re-renders (call sites
  // put execute in useCallback deps; FlowPage's cleanup effect depends on it).
  const mutateRef = useRef(mutateAsync);
  mutateRef.current = mutateAsync;

  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      abortRef.current?.abort();
    };
  }, []);

  const execute = useCallback(
    async <U>(fn: (signal: AbortSignal) => Promise<U>): Promise<U> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      cancelledRef.current = false;
      currentSignalRef.current = controller.signal;
      return mutateRef.current(async (signal) => {
        try {
          return await fn(signal);
        } catch (err) {
          if (cancelledRef.current) throw err;
          if (err instanceof DOMException && err.name === "AbortError") {
            throw err; // still throw so the promise chain works, but don't setError
          }
          throw err instanceof Error ? err : new Error(String(err));
        }
      }) as Promise<U>;
    },
    [],
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    abortRef.current?.abort();
  }, []);

  return { execute, cancel, isLoading: false, error: null };
}
