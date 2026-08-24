/**
 * Regression: cleartext oldDataEncryptionKey is rejected when
 * AXIOM_ALLOW_CLEARTEXT_DEK is not enabled (production-shaped default).
 */
import { test, beforeAll } from "bun:test";
import assert from "node:assert/strict";
import { keccak256 } from "ethers";

import { InMemoryStorage } from "@axiom/config/storage/0g";
import { DEFAULT_EIP712_DOMAIN } from "@axiom/config/eip712";
import { TeeSigner } from "../oracle/signer.js";
import {
  transferValidity,
  OracleRequestError,
  type OracleRouteDeps,
} from "../oracle/routes.js";
import { aesGcmEncrypt, concatEncrypted } from "@axiom/config/crypto/aes-gcm";
import { publicKeyUncompressedFromPrivate } from "@axiom/config/crypto/keys";
import { ARISTOTLE_CHAIN_ID } from "@axiom/config";

const TEST_PRIV_HEX = "0x" + "11".repeat(32);
const TEST_RECEIVER_PRIV_HEX = "0x" + "22".repeat(32);
const TEST_RECEIVER_PUBKEY_HEX = ("0x" +
  Buffer.from(
    publicKeyUncompressedFromPrivate(
      new Uint8Array(Buffer.from(TEST_RECEIVER_PRIV_HEX.slice(2), "hex")),
    ),
  ).toString("hex")) as `0x${string}`;
const MOCK_VERIFIER = ("0x" + "00".repeat(19) + "03") as `0x${string}`;

let storage: InMemoryStorage;
let deps: OracleRouteDeps;

beforeAll(() => {
  // Explicitly disable cleartext path for this suite.
  delete process.env.AXIOM_ALLOW_CLEARTEXT_DEK;
  process.env.AXIOM_DISABLE_AUTH = "true";
  process.env.NODE_ENV = "test";

  storage = new InMemoryStorage();
  const signer = new TeeSigner(TEST_PRIV_HEX, DEFAULT_EIP712_DOMAIN);
  deps = {
    signer,
    storage,
    chainId: BigInt(ARISTOTLE_CHAIN_ID),
    verifier: MOCK_VERIFIER,
  };
});

test("cleartext oldDataEncryptionKey is rejected with 400 when flag unset", async () => {
  const aesKey = new Uint8Array(32).fill(0x09);
  const plaintext = new TextEncoder().encode("must not accept cleartext DEK");
  const enc = aesGcmEncrypt(aesKey, plaintext);
  const blob = concatEncrypted(enc);
  const oldDataHash = keccak256(blob) as `0x${string}`;
  await storage.upload(blob);

  await assert.rejects(
    transferValidity(deps, {
      oldDataHash,
      oldDataUri: oldDataHash,
      targetPubkey64: TEST_RECEIVER_PUBKEY_HEX,
      accessProofNonce: 0,
      ownershipProofNonce: 0,
      oldDataEncryptionKey: Buffer.from(aesKey).toString("base64"),
      to: "0x0000000000000000000000000000000000000001",
      nft: "0x0000000000000000000000000000000000000002",
    }),
    (err: unknown) => {
      assert.ok(err instanceof OracleRequestError);
      assert.equal(err.status, 400);
      assert.match(
        err.message,
        /sealedDataEncryptionKey|cleartext|rejected/i,
        `unexpected error: ${err.message}`,
      );
      return true;
    },
  );
});
