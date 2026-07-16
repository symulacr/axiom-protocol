import assert from "node:assert/strict";
import test from "node:test";
import { redactIocMatch } from "./routers.js";

test("redactIocMatch redacts AWS-style secrets", () => {
  const raw = "AKIAIOSFODNN7EXAMPLE";
  const out = redactIocMatch(raw, "awsAccessKey");
  assert.notEqual(out, raw);
  assert.match(out, /redacted/);
  assert.ok(!out.includes("IOSFODNN7"));
});

test("redactIocMatch leaves ipv4 readable", () => {
  assert.equal(redactIocMatch("1.2.3.4", "ipv4"), "1.2.3.4");
});
