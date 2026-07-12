import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatToolResult } from "./format.js";

describe("formatToolResult", () => {
  it("surfaces encode-only calldata", () => {
    const text = formatToolResult(
      "deposit",
      JSON.stringify({ ok: true, encodeOnly: true, to: "0x1", data: "0xabc", value: "1000", amount: "1.5" }),
    );
    assert.ok(text.length > 0);
    assert.match(text, /to: 0x1/);
    assert.match(text, /data: 0xabc/);
    assert.match(text, /value: 1000/);
    assert.match(text, /amount: 1\.5/);
  });

  it("formats archive confirm", () => {
    const text = formatToolResult(
      "archive_confirm_deletion",
      JSON.stringify({
        wasArchived: true,
        snapshotUrl: "https://web.archive.org/web/2020/example",
        archivedAt: "2020-01-01",
      }),
    );
    assert.match(text, /Archived: yes/);
    assert.match(text, /web\.archive\.org/);
  });

  it("formats vault balance in OG", () => {
    const text = formatToolResult(
      "vault_balance",
      JSON.stringify({ balance: "1500000000000000000" }),
    );
    assert.equal(text, "Balance: 1.5 0G");
  });

  it("formats skill-shaped results readably", () => {
    const text = formatToolResult(
      "stocks_quote",
      JSON.stringify({ symbol: "AAPL", price: 150, currency: "USD" }),
    );
    assert.match(text, /symbol: AAPL/);
    assert.doesNotMatch(text, /\[details\]/);
  });
});
