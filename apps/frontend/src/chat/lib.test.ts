import { describe, expect, it } from "bun:test";
import { parseToolArguments } from "./lib";

describe("parseToolArguments", () => {
  it("parses well-formed arguments", () => {
    expect(parseToolArguments('{"tokenId":"50"}')).toEqual({ tokenId: "50" });
    expect(parseToolArguments(undefined)).toEqual({});
    expect(parseToolArguments("")).toEqual({});
  });

  it("salvages the first object when the model emits two concatenated objects", () => {
    const malformed = '{"tokenId":"50"}\n{"tokenId":"50"}';
    const result = parseToolArguments(malformed);
    expect(result).toEqual({ tokenId: "50" });
  });

  it("returns empty for prose-only or brace-less payloads", () => {
    expect(parseToolArguments("sorry, I cannot")).toEqual({});
    // first balanced block still wins even with trailing prose
    expect(parseToolArguments('{"tokenId":"7"} — here you go')).toEqual({
      tokenId: "7",
    });
  });

  it("respects braces inside strings", () => {
    expect(parseToolArguments('{"q":"use } carefully","n":1}{"x":2}')).toEqual({
      q: "use } carefully",
      n: 1,
    });
  });
});
