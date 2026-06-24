import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseAsyncActionResult {
  execute: <U>(fn: (signal: AbortSignal) => Promise<U>) => Promise<U>;
  isLoading: boolean;
  error: Error | null;
  reset: () => void;
}

export function useAsyncAction(): UseAsyncActionResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const execute = useCallback(async <U>(fn: (signal: AbortSignal) => Promise<U>): Promise<U> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      return await fn(controller.signal);
    } catch (err) {
      const wrapped = err instanceof Error ? err : new Error(String(err));
      setError(wrapped);
      throw wrapped;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
  }, []);

  return { execute, isLoading, error, reset };
}
