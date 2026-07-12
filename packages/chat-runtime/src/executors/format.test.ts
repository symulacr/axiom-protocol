import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatToolResult } from "../format.js";

describe("formatToolResult", () => {
  it("surfaces encode-only calldata instead of discarding", () => {
    const text = formatToolResult(
      "deposit",
      JSON.stringify({
        ok: true,
        encodeOnly: true,
        to: "0x1",
        data: "0xabc",
        value: "1000",
        amount: "1.5",
      }),
    );
    assert.ok(text.length > 0);
    assert.match(text, /to: 0x1/);
    assert.match(text, /data: 0xabc/);
    assert.match(text, /value: 1000/);
    assert.match(text, /amount: 1\.5/);
  });

  it("formats skill-shaped results readably", () => {
    const text = formatToolResult(
      "stocks_quote",
      JSON.stringify({ symbol: "AAPL", price: 150, currency: "USD" }),
    );
    assert.match(text, /symbol: AAPL/);
    assert.match(text, /price: 150/);
    assert.doesNotMatch(text, /\[details\]/);
  });
});
