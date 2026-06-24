/** Em-dash placeholder for absent values. */
export const PLACEHOLDER = '\u2014';
const ELLIPSIS = '\u2026';

/** Truncate `0x…` hex string to `head + … + tail`. */
export function truncateHex(value: string, head = 10, tail = 6): string {
  if (value.length <= head + tail + 2) {
    return value;
  }
  return `${value.slice(0, head)}${ELLIPSIS}${value.slice(-tail)}`;
}

/** Shorten 0x-prefixed address for inline display. */
export function shortAddr(value: string | undefined): string {
  if (value === undefined || value === '') return PLACEHOLDER;
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}${ELLIPSIS}${value.slice(-4)}`;
}
