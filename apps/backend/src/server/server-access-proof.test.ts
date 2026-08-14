import { test, beforeAll } from "bun:test";
import assert from "node:assert/strict";
import { Wallet, getBytes, toBeHex, SigningKey, computeAddress } from "ethers";

import { signOwnership, type OracleRouteDeps } from "../oracle/routes.js";
import { TeeSigner } from "../oracle/signer.js";
import { accessMessageHash } from "@axiom/config/eip712";
import { InMemoryStorage } from "@axiom/config/storage/0g";
import { ARISTOTLE_CHAIN_ID } from "@axiom/config";

const TEST_PRIV_HEX = "0x" + "11".repeat(32);
const RECEIVER_PRIV_HEX = "0x" + "22".repeat(32);
const dataHash = ("0x" + "aa".repeat(32)) as `0x${string}`;
const targetPubkey = ("0x" + "bb".repeat(64)) as `0x${string}`;
const sealedKey = ("0x" + "cc".repeat(32)) as `0x${string}`;
const MOCK_VERIFIER = ("0x" + "00".repeat(19) + "03") as `0x${string}`;

let signerAddress: string;
let deps: OracleRouteDeps;

beforeAll(async () => {
  const signer = new TeeSigner(TEST_PRIV_HEX);
  signerAddress = signer.address;
  const storage = new InMemoryStorage();
  deps = {
    signer,
    storage,
    chainId: BigInt(ARISTOTLE_CHAIN_ID),
    verifier: MOCK_VERIFIER,
  };
  // The mint endpoint is HTTP-tested elsewhere (server.test.ts); seed the
  // seen-registry in-process here so signOwnership accepts the hash.
  storage.markDataHashSeen(dataHash);
});

test("signOwnership no longer returns an accessSignature", async () => {
  const result = await signOwnership(deps, {
    dataHash,
    targetPubkey,
    sealedKey,
    to: "0x0000000000000000000000000000000000000001",
    nft: "0x0000000000000000000000000000000000000002",
    nonce: 1,
  });
  assert.equal(
    "accessSignature" in result,
    false,
    "oracle must not sign AccessProof",
  );
  assert.equal(typeof result.signature, "string");
  assert.equal(result.signer, signerAddress);
});

test("recoverAccessSigner still recovers a raw-ECDSA AccessProof", async () => {
  const signer = new TeeSigner(TEST_PRIV_HEX);
  const receiver = new Wallet(RECEIVER_PRIV_HEX);
  const input = {
    dataHash,
    targetPubkey,
    to: "0x0000000000000000000000000000000000000001" as `0x${string}`,
    nft: "0x0000000000000000000000000000000000000002" as `0x${string}`,
    nonce: toBeHex(7n) as `0x${string}`,
    validUntil: 99999999999n,
  };
  const digest = accessMessageHash(input);
  const sig = receiver.signingKey.sign(getBytes(digest))
    .serialized as `0x${string}`;

  const recovered = signer.recoverAccessSigner(sig, input);
  assert.equal(recovered.toLowerCase(), receiver.address.toLowerCase());

  const directRecovered = computeAddress(
    SigningKey.recoverPublicKey(getBytes(digest), sig),
  );
  assert.equal(directRecovered.toLowerCase(), recovered.toLowerCase());
});
