import { describe, it } from "bun:test";
import assert from "node:assert/strict";
import { createLogger } from "./logger.js";

describe("logger BigInt safety", () => {
  it("does not throw when logging objects containing BigInt values", () => {
    const log = createLogger("test");
    assert.doesNotThrow(() => {
      log.warn("x", { err: { validUntil: 10n, nested: { big: 20n } } });
    });
  });
});
