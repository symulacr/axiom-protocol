// Per ECMA-262 §25.5.2, JSON.stringify throws on BigInt values.
// Pass bigintReplacer as JSON.stringify's second arg for safe serialization.

export function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}
