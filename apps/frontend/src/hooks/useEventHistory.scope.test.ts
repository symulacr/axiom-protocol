/**
 * U6 — shared user-scoping predicate for indexer events. Pure functions;
 * run under bun test without a DOM (mirrors transferHandoff.test.ts style).
 */
import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import { isOwnEvent, type AxiomEvent } from "./useEventHistory";

const ME = "0xaaaa000000000000000000000000000000000000";
const STRANGER = "0xbbbb000000000000000000000000000000000000";

function ev(payload?: Record<string, unknown>): AxiomEvent {
  return {
    blockNumber: 1,
    logIndex: 0,
    txHash: "0xabc",
    chainId: 16602,
    receivedAt: 0,
    eventName: "AgentMinted",
    payload,
  };
}

describe("isOwnEvent scope predicate", () => {
  const tokenIds = new Set(["7", "42"]);
  const scope = { address: ME, tokenIds };

  test("matches when the event carries one of my agent token ids", () => {
    assert.ok(isOwnEvent(ev({ tokenId: 7 }), scope));
    assert.ok(isOwnEvent(ev({ agentTokenId: "42" }), scope));
    // numeric-vs-string tokenId normalization must agree
    assert.ok(isOwnEvent(ev({ _tokenId: 7n }), scope));
  });

  test("matches my address in from/to/owner payload fields (case-insensitive)", () => {
    assert.ok(isOwnEvent(ev({ from: ME }), scope));
    assert.ok(isOwnEvent(ev({ to: ME.toUpperCase() }), scope));
    assert.ok(isOwnEvent(ev({ owner: ME }), scope));
  });

  test("rejects strangers' events (the topics:[\"*\"] noise)", () => {
    assert.equal(isOwnEvent(ev({ tokenId: 9, from: STRANGER }), scope), false);
    assert.equal(isOwnEvent(ev({ to: STRANGER }), scope), false);
    assert.equal(isOwnEvent(ev(), scope), false);
  });

  test("empty scope owns nothing", () => {
    const empty = { address: undefined, tokenIds: new Set<string>() };
    assert.equal(isOwnEvent(ev({ tokenId: 7 }), empty), false);
    assert.equal(isOwnEvent(ev({ from: ME }), empty), false);
  });
});
