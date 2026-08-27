import { test } from "bun:test";
import assert from "node:assert/strict";
import { keccak256 } from "ethers";
import type { StorageAdapter } from "@axiom/config/storage/0g";
import { TeeSigner } from "../oracle/signer.js";
import { transferValidity, type OracleRouteDeps } from "../oracle/routes.js";
import {
  sealKeyForReceiver,
  deriveUncompressedPubkeyFromHex,
} from "@axiom/config/crypto/keys";
import { aesGcmEncrypt, concatEncrypted } from "@axiom/config/crypto/aes-gcm";
import { DEFAULT_EIP712_DOMAIN } from "@axiom/config/eip712";
import { ARISTOTLE_CHAIN_ID } from "@axiom/config";

const TEST_PRIV_HEX = "0x" + "11".repeat(32);
const RECEIVER_PRIV_HEX = "0x" + "22".repeat(32);
const MOCK_VERIFIER = ("0x" + "00".repeat(19) + "03") as `0x${string}`;

test("second transferValidity challenge with the same rootHash does not re-download", async () => {
  const signer = new TeeSigner(TEST_PRIV_HEX, DEFAULT_EIP712_DOMAIN);
  const receiverPubkey64 = deriveUncompressedPubkeyFromHex(RECEIVER_PRIV_HEX);
  const receiverPubkeyHex =
    "0x" + Buffer.from(receiverPubkey64).toString("hex");

  // Stub storage with a download spy — counts calls, never hits real 0G.
  let downloadCalls = 0;
  const aesKey = new Uint8Array(32).fill(0x07);
  const plaintext = new TextEncoder().encode("R2 blob cache roundtrip");
  const oldBlob = concatEncrypted(aesGcmEncrypt(aesKey, plaintext));
  const oldDataHash = keccak256(oldBlob) as `0x${string}`;
  const uploaded: Uint8Array[] = [];
  const storage: StorageAdapter = {
    upload: async (blob: Uint8Array) => {
      uploaded.push(blob);
      return { rootHash: keccak256(blob) as `0x${string}` };
    },
    download: async () => {
      downloadCalls++;
      return oldBlob;
    },
    markDataHashSeen: () => {},
    hasSeenDataHash: () => false,
  };
  const deps: OracleRouteDeps = {
    signer,
    storage,
    chainId: BigInt(ARISTOTLE_CHAIN_ID),
    verifier: MOCK_VERIFIER,
  };

  const sealedDek = sealKeyForReceiver(signer.uncompressedPubkey, aesKey);
  const sealedDataEncryptionKey = "0x" + Buffer.from(sealedDek).toString("hex");
  const input = {
    oldDataHash,
    oldDataUri: oldDataHash,
    targetPubkey64: receiverPubkeyHex as `0x${string}`,
    accessProofNonce: 1,
    to: "0x0000000000000000000000000000000000000001",
    nft: "0x0000000000000000000000000000000000000002",
    sealedDataEncryptionKey,
  };

  const first = await transferValidity(deps, input);
  assert.equal(downloadCalls, 1, "first challenge downloads the old blob");
  assert.equal(first.newDataHash, first.newDataUri);

  // Second challenge against the SAME immutable root: served from the LRU cache.
  const second = await transferValidity(deps, input);
  assert.equal(
    downloadCalls,
    1,
    "cached rootHash must not trigger a second storage.download",
  );

  // A different root still downloads (cache key = root, not a global bypass).
  const otherBlob = concatEncrypted(
    aesGcmEncrypt(new Uint8Array(32).fill(0x09), plaintext),
  );
  const otherHash = keccak256(otherBlob) as `0x${string}`;
  await transferValidity(deps, {
    ...input,
    oldDataHash: otherHash,
    oldDataUri: otherHash,
  });
  assert.equal(
    downloadCalls,
    2,
    "distinct rootHash is a cache miss and downloads",
  );
});
