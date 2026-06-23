// Axiom Protocol — typed `useLocalStorage` hook.

import { useCallback, useEffect, useState } from 'react';

type Setter<T> = (value: T) => void;

export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
): [T, Setter<T>] {
  // SSR-safe initial state: never read `window` here. The first client
  // render returns `defaultValue`, matching the server output and avoiding
  // a React hydration warning. The real stored value is loaded in the
  // mount-effect below.
  const [value, setValue] = useState<T>(defaultValue);

  // After mount on the client, hydrate from `localStorage` if the key is
  // present. Wrapped in a feature-detect for `window` so the hook stays
  // safe to import in non-browser test runners.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) {
        setValue(JSON.parse(stored) as T);
      }
    } catch {
      // Corrupt JSON, storage disabled, or quota error: keep default.
    }
  }, [key]);

  // Writes through to localStorage synchronously.
  const setStoredValue = useCallback<Setter<T>>(
    (next: T) => {
      setValue(next);
      if (typeof window === 'undefined') {
        return;
      }
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Storage full, private mode, or disabled: silently no-op so the
        // UI does not crash. The in-memory value is still updated.
      }
    },
    [key],
  );

  return [value, setStoredValue];
}

export default useLocalStorage;
