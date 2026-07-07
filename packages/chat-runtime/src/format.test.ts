import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatToolResult } from "./format.js";

describe("formatToolResult", () => {
  it("hides encode-only payloads", () => {
    const text = formatToolResult(
      "deposit",
      JSON.stringify({ ok: true, encodeOnly: true, to: "0x1", data: "0x" }),
    );
    assert.equal(text, "");
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
});