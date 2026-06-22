/** Branded mapped type: serialized bigint values. */
export type Serialized<T extends bigint> = T extends bigint ? string : never;
export type Deserialized<T extends string> = T extends string ? bigint : never;

export function parseBigInt(value: string, label = "value"): bigint {
  try {
    const n = BigInt(value);
    if (n < BigInt(0)) throw new RangeError("negative");
    return n;
  } catch (e) {
    throw new Error(`Invalid bigint ${label}: ${value} (${(e as Error).message})`);
  }
}

export function extractBigIntArg(args: Record<string, unknown>, key: string): bigint {
  const raw = args[key];
  if (typeof raw !== "bigint") throw new Error(`${key} is not a bigint: ${raw}`);
  return raw;
}
