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

/** Parse a token ID string from URL params. Returns null for invalid input. */
export function parseTokenId(raw: string | undefined): bigint | null {
  if (raw === undefined || raw === '') return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}
