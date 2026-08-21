/**
 * F-01: the transfer failure path must be humanized — the backend's raw
 * signer-mismatch 400 and the receiver-unavailable blocker both map to an
 * actionable sentence, never raw protocol text.
 */
import assert from "node:assert/strict";
import { test } from "bun:test";
import { humanizeError } from "./format";

test("humanizeError maps the accessProof signer-mismatch 400 to the co-sign remedy", () => {
  const out = humanizeError(
    new Error("accessProof signer does not match recipient address"),
  );
  assert.match(out, /recipient's own wallet/);
  assert.match(out, /Sign as receiver/);
  assert.doesNotMatch(out, /accessProof/);
});

test("humanizeError maps the receiver-unavailable blocker to the two remedies", () => {
  const out = humanizeError(
    new Error(
      "The receiving account 0x845016B204fb2db028Ff148990Fc75bb606EE239 is not available in the connected wallet.",
    ),
  );
  assert.match(out, /Add the receiver account/);
  assert.match(out, /their own session/);
});

test("humanizeError still maps the oracle unknown-dataHash gate", () => {
  const out = humanizeError(
    new Error(
      "Unknown dataHash: not previously seen by oracle. POST {dataHash} to /v1/agents/mint first.",
    ),
  );
  assert.match(out, /not registered with the oracle/);
  assert.doesNotMatch(out, /POST/);
});
