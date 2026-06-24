import canonicalize from "canonicalize";
import type { AxiomEvent } from "./events.js";

/**
 * Serialize one AxiomEvent to canonical byte form (RFC 8785).
 * Uses the `canonicalize` npm package for deterministic JSON serialization.
 */
export function canonicalizeEvent(event: AxiomEvent): Uint8Array {
  const canon = canonicalize(event);
  return new TextEncoder().encode(canon ?? "");
}
