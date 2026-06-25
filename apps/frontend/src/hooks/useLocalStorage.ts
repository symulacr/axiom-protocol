import { useCallback, useEffect, useState } from 'react';

type Setter<T> = (value: T) => void;

export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
): [T, Setter<T>] {
  // SSR-safe: `defaultValue` avoids hydration warning. Hydrate from storage after mount.
  const [value, setValue] = useState<T>(defaultValue);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) {
        setValue(JSON.parse(stored) as T);
      }
    } catch (err) {
      console.warn('[useLocalStorage] Failed to parse stored value for key:', key, err);
      // Corrupt or disabled — keep default.
    }
  }, [key]);

  const setStoredValue = useCallback<Setter<T>>(
    (next: T) => {
      setValue(next);
      if (typeof window === 'undefined') {
        return;
      }
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch (err) {
        console.warn('[useLocalStorage] Failed to write key:', key, err);
        // Storage full or disabled — in-memory value is still updated.
      }
    },
    [key],
  );

  return [value, setStoredValue];
}

export default useLocalStorage;
