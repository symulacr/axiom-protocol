// apps/indexer/src/serialization.ts
//
// Deterministic, byte-stable JSON serialization for indexed events.
// Follows RFC 8785 (JSON Canonicalization Scheme): sorted object keys,
// bigints as decimal strings, array order preserved.

import type { AxiomEvent } from "./events.js";

/**
 * The set of "object" JavaScript values we recursively canonicalize.
 * We keep this a narrow union on purpose: the input is an `AxiomEvent`
 * (a discriminated union of plain objects with primitive leaves), so we
 * do not have to handle Maps, Sets, Dates, or class instances.
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
 * Convert one value to its canonical JSON string. Recursively sorts
 * object keys. Encodes bigints as decimal strings.
 *
 * Exposed (and unit-tested) so future sinks (e.g. an Axiom→IPFS
 * bridge) can reuse the same canonicalization.
 */
export function canonicalize(value: JsonValue) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    // Per RFC 8785 §3.2.2.3, numbers use JSON's "shortest round-trip"
    // representation. `JSON.stringify` already produces that.
    return JSON.stringify(value);
  }
  if (typeof value === "bigint") {
    // Decimal string — JSON has no native bigint; a string is the only
    // lossless, RFC-compliant encoding.
    return JSON.stringify(value.toString(10));
  }
  if (Array.isArray(value)) {
    // Preserve array order. Each element is canonicalized recursively.
    const parts: string[] = [];
    for (const item of value) {
      parts.push(canonicalize(item));
    }
    return `[${parts.join(",")}]`;
  }
  // Plain object: sort keys, recurse, emit.
  const keys = Object.keys(value).sort();
  const parts: string[] = [];
  for (const k of keys) {
    parts.push(`${JSON.stringify(k)}:${canonicalize((value as Record<string, JsonValue>)[k] as JsonValue)}`);
  }
  return `{${parts.join(",")}}`;
}

/**
 * Coerce one `AxiomEvent` into the `JsonValue` shape that
 * `canonicalize` accepts. Every `bigint` is preserved; every `Hex`
 * and `Address` is left as a string; every `readonly` field is read
 * by index access (no copy).
 */
function eventToJsonValue(event: AxiomEvent) {
  // We deliberately build the object via a plain mutable intermediate
  // and freeze nothing — `canonicalize` reads each property once.
  const out: Record<string, JsonValue> = {};
  for (const [k, v] of Object.entries(event)) {
    out[k] = v;
  }
  return out;
}

/**
 * Serialize one `AxiomEvent` to its canonical byte form.
 *
 * The bytes are UTF-8 of the JCS string. `TextEncoder` is the right
 * tool: `Buffer.from(string)` would also work in Node 22, but
 * `TextEncoder` is portable to browsers and is what every canonical
 * JSON library uses for the final byte step (RFC 8785 §3.2 step 6).
 */
export function canonicalizeEvent(event: AxiomEvent) {
  return new TextEncoder().encode(canonicalize(eventToJsonValue(event)));
}

