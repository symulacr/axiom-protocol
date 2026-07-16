import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AXIOM_ASSISTANT_NAME,
  DEFAULT_CHAT_MODEL,
  resolveChatModel,
} from "./models.js";

describe("resolveChatModel", () => {
  it("returns the override when provided", () => {
    assert.equal(resolveChatModel("custom/model"), "custom/model");
  });

  it("returns the default when override is empty", () => {
    assert.equal(resolveChatModel(""), DEFAULT_CHAT_MODEL);
    assert.equal(DEFAULT_CHAT_MODEL, "deepseek-v4-flash");
  });

  it("returns the default when override is undefined", () => {
    assert.equal(resolveChatModel(undefined), DEFAULT_CHAT_MODEL);
  });

  it("brands the assistant as Axiom", () => {
    assert.equal(AXIOM_ASSISTANT_NAME, "Axiom");
  });
});
