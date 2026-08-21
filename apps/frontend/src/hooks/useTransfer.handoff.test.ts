/**
 * Structural test (P4 cross-wallet handoff): the sender-side hook must (1)
 * export the paused challenge as a receiver-signable URL on the canonical
 * /transfer/co-sign path, (2) verify a pasted/relayed acceptance signature
 * LOCALLY against the receiver address before any finalize call, and (3) keep
 * the sender as the only party who submits the on-chain transaction.
 */
import assert from "node:assert/strict";
import { test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const src = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "useTransfer.ts"),
  "utf8",
);

test("useTransfer exports the handoff URL via the shared payload encoder", () => {
  assert.match(src, /coSignHandoffUrl/);
  assert.match(src, /encodeHandoffPayload/);
  assert.match(src, /handoffUrl\(/);
  // The payload carries the full typed data (domain + canonical message) and
  // the receiver metadata — the receiver page never calls the backend to
  // reconstruct it.
  assert.match(src, /primaryType: "AccessProof",\s*\n\s*message,/);
  assert.match(src, /receiver: pending\.input\.to/);
});

test("useTransfer verifies an acceptance signature against the receiver before finalizing", () => {
  // Local recovery must run BEFORE finalizePrepared — a mismatched code can
  // never reach the backend (which would only echo the same rule as a 400).
  assert.match(src, /recoverTypedDataAddress\(\{/);
  assert.match(
    src,
    /recovered\.toLowerCase\(\) !== pending\.input\.to\.toLowerCase\(\)/,
  );
  const recoverAt = src.indexOf("recoverTypedDataAddress({");
  const guardAt = src.indexOf(
    "recovered.toLowerCase() !== pending.input.to.toLowerCase()",
  );
  const finalizeAt = src.indexOf("await finalizePrepared({", guardAt);
  assert.ok(recoverAt >= 0 && guardAt > recoverAt && finalizeAt > guardAt);
});

test("useTransfer rejects non-signature acceptance codes up front", () => {
  assert.match(src, /ACCEPTANCE_CODE_SHAPE\.test\(signature\)/);
  assert.match(src, /HandoffSignatureInvalidError/);
});

test("useTransfer never signs or submits on the receiver's behalf in the handoff path", () => {
  // applyHandoffSignature contains no signTypedDataAsync and no write() — the
  // receiver signs on their device; the sender's confirm() stays the only
  // on-chain submission.
  const applyStart = src.indexOf("const applyHandoffSignature");
  const applyEnd = src.indexOf("const confirm = useCallback");
  const applyBody = src.slice(applyStart, applyEnd);
  assert.ok(applyStart >= 0 && applyEnd > applyStart);
  assert.doesNotMatch(applyBody, /signTypedDataAsync/);
  assert.doesNotMatch(applyBody, /write\(\{/);
});
