/** Display the em-dash for an absent value. Shared across all pages. */
export const PLACEHOLDER = '\u2014';
const ELLIPSIS = '\u2026';

/**
 * Truncate a `0x…` hex string to `head + … + tail`.
 * Returns the original string if it's shorter than head + tail + 2.
 */
export function truncateHex(value: string, head = 10, tail = 6): string {
  if (value.length <= head + tail + 2) {
    return value;
  }
  return `${value.slice(0, head)}${ELLIPSIS}${value.slice(-tail)}`;
}

/** Shorten a 0x-prefixed address to `0x1234…5678` for inline display. */
export function shortAddr(value: string | undefined): string {
  if (value === undefined || value === '') return PLACEHOLDER;
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}${ELLIPSIS}${value.slice(-4)}`;
}
