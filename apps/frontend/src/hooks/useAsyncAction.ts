import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseAsyncActionResult {
  execute: <U>(fn: (signal: AbortSignal) => Promise<U>) => Promise<U>;
  cancel: () => void;
  isLoading: boolean;
  error: Error | null;
  reset: () => void;
}

export function useAsyncAction(): UseAsyncActionResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      abortRef.current?.abort();
    };
  }, []);

  const execute = useCallback(async <U>(fn: (signal: AbortSignal) => Promise<U>): Promise<U> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    cancelledRef.current = false;
    setIsLoading(true);
    setError(null);
    try {
      return await fn(controller.signal);
    } catch (err) {
      if (cancelledRef.current) throw err;
      // Skip AbortErrors — they're expected on unmount/rerun
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err; // still throw so the promise chain works, but don't setError
      }
      const wrapped = err instanceof Error ? err : new Error(String(err));
      setError(wrapped);
      throw wrapped;
    } finally {
      if (!cancelledRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    setError(null);
  }, []);

  return { execute, cancel, isLoading, error, reset };
}
