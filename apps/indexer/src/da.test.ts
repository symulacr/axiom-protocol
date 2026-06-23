// apps/indexer/src/da.test.ts
//
// Tests for the DA submitter and the canonical JSON serializer.
// Covers submitEvent with mock submitFn, RFC 8785 canonicalization,
// error swallowing, and sentinel return on missing config.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address, Hex } from "viem";

import { submitEvent, type SubmitResult } from "./da.js";
import { canonicalizeEvent } from "./serialization.js";
import type { AxiomEvent } from "./events.js";

/**
 * Build a fully-populated `Transfer` event for fixture use. We pick
 * values that exercise every part of the serializer (bigints, hex
 * strings, primitive numbers) so the test cannot pass by accident
 * for "easy" inputs.
 */
function makeTransferEvent(
  overrides: Partial<Extract<AxiomEvent, { kind: "Transfer" }>> = {},
): Extract<AxiomEvent, { kind: "Transfer" }> {
  return {
    kind: "Transfer",
    blockNumber: 942_105,
    txHash: "0x9f1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c" as Hex,
    logIndex: 3,
    from: "0x0000000000000000000000000000000000000000" as Address,
    to: "0x437371db1fbd534bd01bd3f4e66dfa1675952f91" as Address,
    tokenId: 1n,
    ...overrides,
  };
}

function bytesToString(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}

describe("canonical JSON serialization (RFC 8785)", () => {
  it("sorts object keys lexicographically", () => {
    const ev: AxiomEvent = makeTransferEvent();
    const text = bytesToString(canonicalizeEvent(ev));
    const expected =
      '{"blockNumber":942105,"from":"0x0000000000000000000000000000000000000000",' +
      '"kind":"Transfer","logIndex":3,"to":"0x437371db1fbd534bd01bd3f4e66dfa1675952f91",' +
      '"tokenId":"1","txHash":"0x9f1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c"}';
    assert.equal(text, expected);
  });

  it("encodes bigints as decimal strings, not JSON numbers", () => {
    // tokenId > 2^53 would round-trip incorrectly as a number; we
    // use 2^80 to make the test impossible to pass by accident.
    const big = 1n << 80n;
    const ev = makeTransferEvent({ tokenId: big });
    const text = bytesToString(canonicalizeEvent(ev));
    assert.ok(
      text.includes(`"tokenId":"${big.toString(10)}"`),
      `tokenId not decimal-string: ${text}`,
    );
    // And the bigint must NOT be serialized as a bare JSON number
    // (which would be a string of digits without surrounding quotes).
    assert.ok(
      !new RegExp(`"tokenId":${big.toString(10)}[^0-9]`).test(text),
      "tokenId must be quoted",
    );
  });

  it("is byte-stable across repeated invocations", () => {
    const ev: AxiomEvent = makeTransferEvent();
    const a = canonicalizeEvent(ev);
    const b = canonicalizeEvent(ev);
    assert.equal(bytesToString(a), bytesToString(b));
    assert.equal(a.byteLength, b.byteLength);
  });

  it("preserves array order (RFC 8785 §3.2.2.4)", () => {
    // The PublishedSealedKey event carries a readonly Hex[] that
    // must keep its on-chain order.
    const ev: AxiomEvent = {
      kind: "PublishedSealedKey",
      blockNumber: 1,
      txHash: "0xaa" as Hex,
      logIndex: 0,
      to: "0x0000000000000000000000000000000000000000" as Address,
      tokenId: 42n,
      sealedKeys: [
        "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex,
        "0x2222222222222222222222222222222222222222222222222222222222222222" as Hex,
        "0x3333333333333333333333333333333333333333333333333333333333333333" as Hex,
      ],
    };
    const text = bytesToString(canonicalizeEvent(ev));
    const i1 = text.indexOf("0x1111");
    const i2 = text.indexOf("0x2222");
    const i3 = text.indexOf("0x3333");
    assert.ok(i1 < i2 && i2 < i3, `sealedKeys out of order in: ${text}`);
  });
});

describe("submitEvent (mock submitter path)", () => {
  it("returns the txHash + seq from the injected submitFn", async () => {
    const ev = makeTransferEvent();
    const expected: SubmitResult = {
      txHash: "0xdeadbeef" + "00".repeat(28),
      seq: 7n,
    };
    const seen: { bytesLen: number; eventKind: AxiomEvent["kind"] } = {
      bytesLen: 0,
      eventKind: "Transfer",
    };
    const submitFn = async (
      bytes: Uint8Array,
      event: AxiomEvent,
    ): Promise<SubmitResult> => {
      seen.bytesLen = bytes.length;
      seen.eventKind = event.kind;
      return expected;
    };

    // Capture the logger so we can assert the success path is silent.
    const logged: unknown[] = [];
    const logger = (line: Record<string, unknown>): void => {
      logged.push(line);
    };

    const result = await submitEvent(ev, { submitFn, logger });
    assert.deepEqual(result, expected);
    assert.equal(seen.eventKind, "Transfer");
    assert.ok(seen.bytesLen > 0, "submitFn received empty bytes");
    assert.equal(logged.length, 0, "success path must not log");
  });

  it("passes the canonical JSON bytes to the submitFn", async () => {
    const ev = makeTransferEvent();
    const expectedText = bytesToString(canonicalizeEvent(ev));
    let observed = "";
    const submitFn = async (bytes: Uint8Array): Promise<SubmitResult> => {
      observed = bytesToString(bytes);
      return { txHash: "0x" + "11".repeat(32), seq: 1n };
    };
    await submitEvent(ev, { submitFn });
    assert.equal(observed, expectedText);
  });

  it("swallows submitFn errors and returns the sentinel (watcher must not crash)", async () => {
    const ev = makeTransferEvent();
    const submitFn = async (): Promise<SubmitResult> => {
      throw new Error("simulated DA outage");
    };
    const logged: Record<string, unknown>[] = [];
    const logger = (line: Record<string, unknown>): void => {
      logged.push(line);
    };

    const result = await submitEvent(ev, { submitFn, logger });
    assert.equal(result.txHash, "", "sentinel txHash is empty string");
    assert.equal(result.seq, 0n, "sentinel seq is 0n");
    assert.equal(logged.length, 1, "exactly one error line emitted");
    const line = logged[0] as { level: string; err: string; kind: string };
    assert.equal(line.level, "error");
    assert.equal(line.kind, "Transfer");
    assert.ok(
      line.err.includes("simulated DA outage"),
      `unexpected err: ${line.err}`,
    );
  });

  it("returns the sentinel when no submitFn and no signer are provided", async () => {
    const ev = makeTransferEvent();
    const logged: Record<string, unknown>[] = [];
    const result = await submitEvent(ev, {
      logger: (l) => {
        logged.push(l);
      },
    });
    assert.equal(result.txHash, "");
    assert.equal(result.seq, 0n);
    assert.equal(logged.length, 1, "skipped submission must be logged");
    const line = logged[0] as { level: string; msg: string };
    assert.equal(line.level, "warn");
    assert.ok(
      line.msg.includes("no submitFn and no DA gRPC URL configured"),
      `unexpected warn: ${line.msg}`,
    );
  });
});
