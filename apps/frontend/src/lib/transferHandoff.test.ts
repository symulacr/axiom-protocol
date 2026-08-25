/**
 * P4 cross-wallet handoff helpers — encoding round-trip and shape guards.
 * Pure functions; run under bun test without a DOM (btoa/atob exist in bun).
 */
import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import {
  ACCEPTANCE_CODE_SHAPE,
  decodeHandoffPayload,
  decodeHandoffResult,
  decodeHandoffResultToken,
  encodeHandoffPayload,
  encodeHandoffResult,
  encodeHandoffResultToken,
  handoffClaimUrl,
  handoffUrl,
  TRANSFER_CO_SIGN_PATH,
  type TransferHandoffPayload,
} from "./transferHandoff";

const validPayload: TransferHandoffPayload = {
  v: 1,
  typedData: {
    domain: {
      name: "AxiomTeeVerifier",
      version: "1",
      chainId: 16602,
      verifyingContract: "0x1ba37125bba23b66b549ccb33bc9b4952fd4dcc4",
    },
    primaryType: "AccessProof",
    message: {
      dataHash:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
      targetPubkey:
        "0x222222222222222222222222222222222222222222222222222222222222222222",
      to: "0x84509fcd0ba2911b58be7cd3e3dd5b1b7d01e239",
      nft: "0x4e57e954d82a99ee94c48e1bc804ba9d131a3622",
      nonce:
        "0x3333333333333333333333333333333333333333333333333333333333333333",
      validUntil: 1893456000n,
    },
  },
  meta: {
    tokenId: "28",
    sender: "0xa499e2b0a5b8eb33b3e5b7ebe1c0a8b5c26f0f63",
    receiver: "0x84509fcd0ba2911b58be7cd3e3dd5b1b7d01e239",
    validUntil: "1893456000",
  },
};

describe("transfer handoff payload", () => {
  test("round-trips through base64url without loss (bigint restored)", () => {
    const encoded = encodeHandoffPayload(validPayload);
    assert.deepEqual(decodeHandoffPayload(encoded), validPayload);
  });

  test("produces a URL-safe encoding on the canonical receive path", () => {
    const url = handoffUrl(
      encodeHandoffPayload(validPayload),
      "https://x.test",
    );
    assert.ok(url.startsWith(`https://x.test${TRANSFER_CO_SIGN_PATH}?data=`));
    assert.match(url, /^[\w:./?=&-]+$/); // no +/= spaces that break sharing
  });

  test("rejects damaged, foreign-version and non-hex payloads", () => {
    assert.equal(decodeHandoffPayload("not-a-payload"), null);
    const vNext = encodeHandoffPayload({ ...validPayload, v: 2 } as never);
    assert.equal(decodeHandoffPayload(vNext), null);
    const badHash = encodeHandoffPayload({
      ...validPayload,
      typedData: {
        ...validPayload.typedData,
        message: {
          ...validPayload.typedData.message,
          dataHash: "nothex" as `0x${string}`,
        },
      },
    });
    assert.equal(decodeHandoffPayload(badHash), null);
    const badReceiver = encodeHandoffPayload({
      ...validPayload,
      meta: { ...validPayload.meta, receiver: "0xzz" as `0x${string}` },
    });
    assert.equal(decodeHandoffResult(JSON.stringify(badReceiver)), null);
  });
});

describe("transfer handoff result code", () => {
  const sig = ("0x" + "ab".repeat(65)) as `0x${string}`;

  test("round-trips a receiver signature with its nonce", () => {
    const result = decodeHandoffResult(
      encodeHandoffResult(sig, validPayload.typedData.message.nonce),
    );
    assert.equal(result?.signature, sig);
    assert.equal(result?.nonce, validPayload.typedData.message.nonce);
    assert.equal(result?.v, 1);
  });

  test("rejects codes that are not 65-byte signatures", () => {
    assert.equal(
      decodeHandoffResult(
        JSON.stringify({ v: 1, signature: "0x1234", nonce: "0x1", at: 1 }),
      ),
      null,
    );
    assert.equal(decodeHandoffResult(null), null);
    assert.equal(decodeHandoffResult("garbage"), null);
    assert.ok(ACCEPTANCE_CODE_SHAPE.test(sig));
  });
});

describe("transfer handoff claim token / link (U26)", () => {
  const sig = ("0x" + "ab".repeat(65)) as `0x${string}`;
  const nonce = validPayload.typedData.message.nonce;

  test("claim token round-trips to the same signature + nonce", () => {
    const token = encodeHandoffResultToken(sig, nonce);
    assert.match(token, /^[\w-]+$/); // base64url, URL-safe, no padding
    const result = decodeHandoffResultToken(token);
    assert.equal(result?.signature, sig);
    assert.equal(result?.nonce, nonce);
  });

  test("rejects damaged tokens instead of throwing", () => {
    assert.equal(decodeHandoffResultToken("not-a-token"), null);
    assert.equal(decodeHandoffResultToken(""), null);
    // valid base64url of garbage JSON
    assert.equal(
      decodeHandoffResultToken(encodeHandoffResultToken("0x12" as `0x${string}`, nonce)),
      null,
    );
  });

  test("claim link carries the token on the sender-side transfer path", () => {
    const url = handoffClaimUrl(encodeHandoffResultToken(sig, nonce), "https://x.test");
    assert.ok(url.startsWith("https://x.test/transfer?result="));
    const token = new URL(url).searchParams.get("result") ?? "";
    assert.equal(decodeHandoffResultToken(token)?.signature, sig);
  });
});
