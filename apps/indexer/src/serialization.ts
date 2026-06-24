// Deterministic, byte-stable JSON serialization (RFC 8785).
// Sorted keys, bigints as decimal strings, array order preserved.

import type { AxiomEvent } from "./events.js";

/**
 * JSON value types we recursively canonicalize. Narrow by design:
 * AxiomEvent is a discriminated union of plain objects with primitives.
 */
type JsonValue =
  | null
  | boolean
  | string
  | number
  | bigint
  | readonly JsonValue[]
  | { readonly [k: string]: JsonValue };

/**
 * Canonical JSON string. Recursively sorts object keys, encodes
 * bigints as decimal strings.
 *
 * Exposed for reuse (e.g. Axiom→IPFS bridge).
 */
export function canonicalize(value: JsonValue) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    // RFC 8785 §3.2.2.3: JSON's "shortest round-trip" representation.
    return JSON.stringify(value);
  }
  if (typeof value === "bigint") {
    // Decimal string is the only lossless, RFC-compliant encoding.
    return JSON.stringify(value.toString(10));
  }
  if (Array.isArray(value)) {
    // Preserve array order; recurse into elements.
    const parts: string[] = [];
    for (const item of value) {
      parts.push(canonicalize(item));
    }
    return `[${parts.join(",")}]`;
  }
  // Plain object: sort keys, recurse.
  const keys = Object.keys(value).sort();
  const parts: string[] = [];
  for (const k of keys) {
    parts.push(`${JSON.stringify(k)}:${canonicalize((value as Record<string, JsonValue>)[k] as JsonValue)}`);
  }
  return `{${parts.join(",")}}`;
}

/**
 * Coerce AxiomEvent to JsonValue for canonicalize.
 */
function eventToJsonValue(event: AxiomEvent) {
  // Build via plain mutable intermediate — canonicalize reads each property once.
  const out: Record<string, JsonValue> = {};
  for (const [k, v] of Object.entries(event)) {
    out[k] = v;
  }
  return out;
}

/**
 * Serialize one AxiomEvent to canonical byte form (UTF-8 of JCS string).
 */
export function canonicalizeEvent(event: AxiomEvent) {
  return new TextEncoder().encode(canonicalize(eventToJsonValue(event)));
}

