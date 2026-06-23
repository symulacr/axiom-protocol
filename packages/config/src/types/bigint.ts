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

// ─── BigInt JSON serialization helpers ──────────────────────────
// Per ECMA-262 §25.5.2, JSON.stringify throws on BigInt values.
// These helpers provide safe serialization paths:
//   - bigintReplacer: pass as JSON.stringify's second arg
//   - stringifyBigIntSafe: convenience wrapper with the replacer
//   - bigIntSafe: deeply converts all bigints to decimal strings
//     for callers that want a plain object for res.json().
// Source: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/BigInt_not_serializable

export function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

export function stringifyBigIntSafe(value: unknown): string {
  return JSON.stringify(value, bigintReplacer);
}

/**
 * Recursively converts every `bigint` value in `value` to its decimal string
 * representation. Non-plain values (functions, symbols) are dropped.
 */
export function bigIntSafe<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString() as unknown as T;
  if (Array.isArray(value)) return value.map((v) => bigIntSafe(v)) as unknown as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = bigIntSafe(v);
    return out as unknown as T;
  }
  return value;
}
