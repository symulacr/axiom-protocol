import { useEffect, useState } from 'react';

/**
 * Reactive media query hook. Returns `true` when the query matches.
 * Uses `matchMedia` with a listener — no resize event overhead.
 *
 * @example
 * const isMobile = useMediaQuery('(max-width: 640px)');
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent): void => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}
