import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../utils/apiFetch.js";

interface PolledApiOptions {
  refetchInterval?: number;
  enabled?: boolean;
  queryKey?: readonly unknown[];
}

export function usePolledApi<T>(
  urlOrGetter: string | (() => string),
  options: PolledApiOptions = {},
) {
  const { refetchInterval = 30000, enabled = true } = options;

  const getterRef = useRef(urlOrGetter);
  getterRef.current = urlOrGetter;

  const defaultKey: readonly unknown[] =
    typeof urlOrGetter === "string" ? [urlOrGetter] : ["polled-api"];

  return useQuery<T, Error>({
    queryKey: options.queryKey ?? defaultKey,
    queryFn: ({ signal: querySignal }) => {
      const url =
        typeof getterRef.current === "function"
          ? getterRef.current()
          : getterRef.current;
      return apiFetch<T>(url, { signal: querySignal });
    },
    refetchInterval,
    enabled,
    staleTime: refetchInterval * 0.8,
    retry: 2,
  });
}
