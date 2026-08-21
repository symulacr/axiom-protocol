/**
 * Structural test (F-01): the AccessProof must be signed by the RECIPIENT
 * (backend + IERC7857DataVerifier require recovered signer == `to`).
 * The hook therefore pauses cross-party transfers for an explicit receiver
 * co-sign, never signs with the connected sender for someone else's
 * acceptance, and exposes an honest blocker when the wallet cannot expose
 * the receiver account.
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

test("useTransfer never signs a cross-party AccessProof as the connected sender", () => {
  // The cross-party branch must pause instead of signing with `from`.
  assert.match(src, /input\.to\.toLowerCase\(\) !== from\.toLowerCase\(\)/);
  assert.match(src, /status: "co-sign-required"/);
  // The signer account is a parameter (receiver on the co-sign path) — the
  // old bug was hardcoding `account: from` for every transfer.
  assert.doesNotMatch(src, /account: from,\n\s*\}\);/);
});

test("useTransfer co-sign signs with the receiver account via the connector", () => {
  assert.match(src, /signerAccount: receiver/);
  assert.match(src, /signerConnector: connector/);
  assert.match(src, /account: signerAccount/);
});

test("useTransfer requests the wallet account switch before declaring a blocker", () => {
  assert.match(src, /wallet_requestPermissions/);
  assert.match(src, /eth_requestAccounts/);
  assert.match(src, /ReceiverAccountUnavailableError/);
});

test("useTransfer confirm survives stale render closures (ref mirror)", () => {
  // FlowPage chains prepare/coSign → confirm inside one async handler, so the
  // prepared proof must be read from the ref, not only the state closure.
  assert.match(src, /signatureRef\.current = proof/);
  assert.match(src, /signature \?\? signatureRef\.current/);
});

test("useTransfer signs the AccessProof nonce as canonical hex (backend hashes toBeHex)", () => {
  // The challenge echoes the nonce as a DECIMAL string; signing that string
  // encodes a different digest and the recovered signer never matches (F-01
  // encoding half).
  assert.match(src, /nonce: toHex\(nonce\)/);
  assert.doesNotMatch(src, /nonce: \(challenge\.accessProofNonce \?\?/);
});
