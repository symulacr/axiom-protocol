/**
 * F-01: the transfer failure path must be humanized — the backend's raw
 * signer-mismatch 400 and the receiver-unavailable blocker both map to an
 * actionable sentence, never raw protocol text.
 */
import assert from "node:assert/strict";
import { test } from "bun:test";
import { errorRefString, humanizeError } from "./format";

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

/* 2026-09-09 prod paste: the backend's invalid_request passthrough
 * ("Compute provider rejected the request: …", chat.ts 400) matched the bare
 * "rejected the request" needle and rendered as "Transaction cancelled — you
 * rejected the request in your wallet." with a raw "Ref invalid_request"
 * line. The provider message must map to its own copy, and only a real wallet
 * cancel may map to userRejected. */
test("backend invalid_request passthrough never reads as a wallet cancellation", () => {
  const err = new Error(
    "Compute provider rejected the request: The request is invalid: Messages with role 'tool' must be a response to a preceding message with 'tool_calls'.",
  ) as Error & { code?: string };
  err.code = "invalid_request";
  const out = humanizeError(err);
  assert.match(out, /rejected this request as invalid/);
  assert.doesNotMatch(out, /cancelled/i);
  assert.doesNotMatch(out, /tool_calls/);
});

test("real wallet rejections still map to the cancelled copy", () => {
  assert.match(
    humanizeError(new Error("User rejected the request.")),
    /rejected the request in your wallet/,
  );
  assert.match(
    humanizeError(new Error("User denied message signature.")),
    /rejected the request in your wallet/,
  );
  const coded = new Error("Request failed with status 400") as Error & {
    code?: number;
  };
  coded.code = 4001;
  // code 4001 alone (no message needle) is still a wallet cancel.
  assert.match(humanizeError(coded), /rejected the request in your wallet/);
});

test("errorRefString renders only when a requestId can correlate", () => {
  assert.equal(errorRefString(null), null);
  assert.equal(errorRefString(new Error("boom")), null);
  // Code-only errors (the prod "Ref invalid_request" line) render no ref.
  assert.equal(errorRefString({ code: "invalid_request" }), null);
  assert.equal(errorRefString({ requestId: "req_123" }), "Ref · req_123");
  assert.equal(
    errorRefString({ requestId: "req_123", code: "invalid_request" }),
    "Ref · req_123 · invalid_request",
  );
});
