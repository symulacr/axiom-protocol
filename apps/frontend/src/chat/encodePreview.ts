export type EncodePreview = {
  encodeOnly?: boolean;
  to?: string;
  data?: string;
  value?: string;
  amount?: string;
  amountUnit?: string;
  txHash?: string;
};

export function parseEncodePreview(content: string | null): EncodePreview | null {
  if (!content) return null;
  try {
    const obj = JSON.parse(content) as EncodePreview & { error?: string };
    if (obj.error !== undefined) return null;
    if (obj.encodeOnly || obj.txHash) return obj;
    return null;
  } catch {
    return null;
  }
}

export function hasEncodePreview(content: string | null): boolean {
  return parseEncodePreview(content) !== null;
}