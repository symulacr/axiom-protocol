import assert from "node:assert/strict";
import test from "node:test";
import { settlementSkipReason } from "./index.js";

test("settlementSkipReason is honest about missing proof producer when root set", () => {
  const withRoot = settlementSkipReason(
    "0x1111111111111111111111111111111111111111111111111111111111111111",
  );
  assert.match(withRoot, /Merkle|proof|strategy/i);
  const zero =
    "0x0000000000000000000000000000000000000000000000000000000000000000";
  assert.match(settlementSkipReason(zero), /no strategy|not set|zero/i);
});
