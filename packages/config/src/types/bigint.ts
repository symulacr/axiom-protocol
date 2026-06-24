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

// Per ECMA-262 §25.5.2, JSON.stringify throws on BigInt values.
// Pass bigintReplacer as JSON.stringify's second arg for safe serialization.

export function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}
