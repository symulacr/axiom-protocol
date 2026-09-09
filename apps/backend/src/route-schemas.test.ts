import { test, describe } from "bun:test";
import assert from "node:assert/strict";
import { chatBodySchema, MAX_CHAT_MESSAGES_BYTES } from "./route-schemas.js";

const userMsg = (content: string) => ({ role: "user" as const, content });
const byteLen = (v: unknown): number =>
  new TextEncoder().encode(JSON.stringify(v)).length;

describe("chatBodySchema messages guard (count cap → byte ceiling)", () => {
  test("a 51-message payload passes — the old .max(50) rejected exactly this", () => {
    const messages = Array.from({ length: 51 }, (_, i) => userMsg(`m${i}`));
    const parsed = chatBodySchema.parse({ messages });
    assert.equal(parsed.messages.length, 51);
  });

  test("count is not the gate: 500 small messages pass", () => {
    const messages = Array.from({ length: 500 }, (_, i) => userMsg(`m${i}`));
    assert.equal(chatBodySchema.parse({ messages }).messages.length, 500);
  });

  test("a payload over the byte ceiling rejects with the honest limit text", () => {
    const big = "x".repeat(32_000); // per-message content cap
    const messages = Array.from({ length: 130 }, () => userMsg(big));
    const r = chatBodySchema.safeParse({ messages });
    assert.equal(r.success, false);
    if (!r.success) {
      const text = r.error.issues.map((i) => i.message).join("; ");
      assert.match(text, /4000000-byte ceiling/);
      assert.match(text, /1M-token context window/);
    }
  });

  test("boundary: just under the ceiling passes, just over rejects", () => {
    const big = "x".repeat(32_000);
    // One message's serialized size, minus the array brackets.
    const objLen = byteLen([userMsg(big)]) - 2;
    // N messages serialize to 2 + N*objLen + (N-1) commas — solve for the
    // largest N under the cap, then verify by measuring.
    const n = Math.floor((MAX_CHAT_MESSAGES_BYTES - 1) / (objLen + 1));
    const under = Array.from({ length: n }, () => userMsg(big));
    const over = [...under, userMsg(big)];
    assert.ok(
      byteLen(under) <= MAX_CHAT_MESSAGES_BYTES,
      `under fixture must fit (${byteLen(under)} bytes)`,
    );
    assert.ok(
      byteLen(over) > MAX_CHAT_MESSAGES_BYTES,
      `over fixture must exceed (${byteLen(over)} bytes)`,
    );
    assert.equal(chatBodySchema.safeParse({ messages: under }).success, true);
    assert.equal(chatBodySchema.safeParse({ messages: over }).success, false);
  });

  test("multibyte content is measured in bytes, not chars", () => {
    // 1.5M '€' chars = 4.5M bytes UTF-8 — over the byte ceiling while the
    // char count alone would suggest it fits.
    const euro = "€".repeat(32_000); // 96KB per message in bytes
    const messages = Array.from({ length: 44 }, () => userMsg(euro));
    assert.ok(byteLen(messages) > MAX_CHAT_MESSAGES_BYTES);
    assert.equal(chatBodySchema.safeParse({ messages }).success, false);
  });

  test("other validations are intact", () => {
    // nonempty
    assert.equal(chatBodySchema.safeParse({ messages: [] }).success, false);
    // role enum
    assert.equal(
      chatBodySchema.safeParse({ messages: [{ role: "bot", content: "x" }] })
        .success,
      false,
    );
    // per-message content cap (32k chars) still applies on its own
    assert.equal(
      chatBodySchema.safeParse({ messages: [userMsg("x".repeat(32_001))] })
        .success,
      false,
    );
    // tool messages keep their shape
    assert.equal(
      chatBodySchema.safeParse({
        messages: [
          {
            role: "assistant",
            content: null,
            tool_calls: [
              { id: "c1", function: { name: "t", arguments: "{}" } },
            ],
          },
          { role: "tool", content: "ok", tool_call_id: "c1" },
          userMsg("next"),
        ],
      }).success,
      true,
    );
  });

  test("max_tokens is accepted within the ceiling and rejected past it", () => {
    assert.equal(
      chatBodySchema.safeParse({
        messages: [userMsg("hi")],
        max_tokens: 393216,
      }).success,
      true,
    );
    assert.equal(
      chatBodySchema.safeParse({
        messages: [userMsg("hi")],
        max_tokens: 500_001,
      }).success,
      false,
    );
    // absent stays valid (router defaults to 2048)
    assert.equal(
      chatBodySchema.safeParse({ messages: [userMsg("hi")] }).success,
      true,
    );
  });
});
