import { describe, it } from "bun:test";
import assert from "node:assert/strict";
import { formatToolResult } from "./format.js";

describe("formatToolResult", () => {
  it("surfaces encode-only calldata", () => {
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
    assert.match(text, /price: 150/);
    assert.doesNotMatch(text, /\[details\]/);
  });

  it("always shows the transaction hash for a successful broadcast (F-11)", () => {
    assert.equal(
      formatToolResult(
        "mint_agent",
        JSON.stringify({ ok: true, txHash: "0xdead" }),
      ),
      "Transaction sent: 0xdead",
    );
    assert.equal(
      formatToolResult(
        "deposit",
        JSON.stringify({ ok: true, txHash: "0xbeef", amount: "1.5" }),
      ),
      "Transaction sent: 0xbeef",
    );
  });

  it("renders the first items of skill array results, not '(N items)' (F-12)", () => {
    const text = formatToolResult(
      "evm_multichain",
      JSON.stringify({
        balances: [
          { chain: "galileo", wei: "1" },
          { chain: "aristotle", wei: "2" },
          { chain: "testnet", wei: "3" },
        ],
      }),
    );
    assert.match(text, /balances: /);
    assert.match(text, /galileo/);
    assert.doesNotMatch(text, /\(3 items\)/);
  });
});
