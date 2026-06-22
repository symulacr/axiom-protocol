// Axiom Protocol — typed `useLocalStorage` hook.
//
// Persists a piece of React state to the browser's `localStorage` and keeps
// the in-memory value in sync with subsequent updates from other tabs or
// from the storage event.
//
// SSR-safe: the initial render never reads `window` or `localStorage`. The
// initial value is the supplied `defaultValue`, so server-rendered output
// matches the first client render (no hydration mismatch). After the
// component mounts on the client, a `useEffect` reads the stored value
// (if any) and updates state. This is the standard pattern for
// `useLocalStorage` hooks that must work in environments where `window`
// is undefined at module-load time.
//
// Canonical sources:
//   - MDN: Window.localStorage (getItem, setItem, JSON serialisation):
//     https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
//   - React 18 useState + useEffect (lazy initial state, mount-time sync):
//     https://react.dev/reference/react/useState
//     https://react.dev/reference/react/useEffect
//
// Type signature: a generic `[T, (v: T) => void]` tuple mirroring
// `React.useState`. The setter always replaces the value (it does not
// accept an updater function); callers that need functional updates can
// read the current value via the tuple's first element.

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

  // Setter that writes through to `localStorage` synchronously. Wrapped
  // in `useCallback` so consumers can safely include it in dependency
  // arrays without causing re-renders.
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
