export const PLACEHOLDER = '\u2014';
const ELLIPSIS = '\u2026';

export function truncateHex(value: string, head = 10, tail = 6): string {
  if (value.length <= head + tail + 2) {
    return value;
  }
  return `${value.slice(0, head)}${ELLIPSIS}${value.slice(-tail)}`;
}

export function parseTokenId(raw: string | undefined): bigint | null {
  if (raw === undefined || raw === '') return null;
  try {
    return BigInt(raw);
  } catch (err) {
    console.warn('[format] Fallback parse failed for value:', raw);
    return null;
  }
}
