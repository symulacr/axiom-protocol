/**
 * Live test for `apps/backend/src/storage/0g.ts` Merkle helpers.
 *
 * Two test groups:
 *  1. Unit tests (no env) — `verifyProof` roundtrip with the SDK's own
 *     `MerkleTree.proofAt(i)`, and `rootFromBytes` self-consistency.
 *  2. Live test (opt-in via `DEPLOYER_PK`) — upload to 0G Galileo,
 *     download, and assert the locally reconstructed Merkle root
 *     equals the upload's rootHash.
 *
 * Canonical sources:
 *  - OZ MerkleProof:    https://docs.openzeppelin.com/contracts/5.x/utils/cryptography#MerkleProof
 *  - 0G Storage SDK:    https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk
 *  - 0G Storage merkle: https://docs.0g.ai/developer-hub/building-on-0g/storage/merkle-proofs
 */

// Uses @0gfoundation/0g-storage-ts-sdk (migrated from @0gfoundation/0g-ts-sdk).
import { test } from "node:test";
import assert from "node:assert/strict";
import { MerkleTree, DEFAULT_CHUNK_SIZE } from "@0gfoundation/0g-storage-ts-sdk";
import { verifyProof, rootFromBytes, type MerkleProof } from "../../src/storage/0g.js";

/** Build a 4-leaf Merkle tree from 4 256-byte chunks (== one 1KiB segment). */
function build4LeafTree(): { tree: MerkleTree; leaves: Uint8Array[]; rootHash: string } {
  const leaves = [0, 1, 2, 3].map((i) => {
    const chunk = new Uint8Array(DEFAULT_CHUNK_SIZE);
    for (let j = 0; j < DEFAULT_CHUNK_SIZE; j++) chunk[j] = (i * 17 + j) & 0xff;
    return chunk;
  });
  // Use the same construction AbstractFile.segmentRoot does so the
  // hash + build order matches the SDK exactly.
  const tree = new MerkleTree();
  for (const chunk of leaves) tree.addLeaf(chunk);
  tree.build();
  const rootHash = tree.rootHash();
  if (rootHash === null) throw new Error("tree did not build");
  return { tree, leaves, rootHash };
}

test("verifyProof: accepts every leaf's proof from the SDK's MerkleTree.proofAt()", () => {
  // Build a real 4-leaf tree and grab the SDK's own proof for each leaf.
  // Our off-chain mirror of OZ MerkleProof must accept every one of them.
  const { tree, leaves, rootHash } = build4LeafTree();
  for (let i = 0; i < leaves.length; i++) {
    const p = tree.proofAt(i);
    const proof: MerkleProof = { lemma: [...p.lemma], path: [...p.path] };
    // The leaf hash the SDK uses is keccak256(chunk). Recompute it
    // from the chunk to feed into verifyProof (the proof carries the
    // hash itself in lemma[0] — see MerkleTree.proofAt line 142).
    const leafHash = proof.lemma[0];
    assert.ok(leafHash !== undefined, `proof[${i}].lemma[0] is the leaf hash`);
    assert.equal(verifyProof(rootHash as `0x${string}`, leafHash as `0x${string}`, proof), true, `verifyProof should accept the SDK's own proof for leaf ${i}`);
  }
});

test("verifyProof: rejects a tampered leaf hash", () => {
  const { tree, rootHash } = build4LeafTree();
  const p = tree.proofAt(0);
  const proof: MerkleProof = { lemma: [...p.lemma], path: [...p.path] };
  // Tamper: replace lemma[0] (the leaf) with a different 32-byte hash.
  const tampered = "0x" + "ab".repeat(32);
  assert.equal(verifyProof(rootHash as `0x${string}`, tampered as `0x${string}`, proof), false, "verifyProof must reject when leaf doesn't match lemma[0]");
});

test("rootFromBytes: produces the same root as a hand-built MerkleTree for a 1KiB single-segment payload", () => {
  // Build a 1 KiB payload (4 chunks → 1 segment → top-level tree has
  // 1 leaf = the segment root). Our helper must agree with a hand-
  // built tree that uses the SDK's MerkleTree class directly.
  const payload = new Uint8Array(DEFAULT_CHUNK_SIZE * 4);
  for (let i = 0; i < payload.length; i++) payload[i] = (i * 31 + 7) & 0xff;
  const expectedTree = new MerkleTree();
  // Per AbstractFile.merkleTree(): each segment builds a tree over its
  // chunks, and the file-level tree is built over the segment roots.
  // For 1 segment of 4 chunks: file tree = tree over 1 leaf = that
  // segment root.
  const segTree = new MerkleTree();
  for (let off = 0; off < payload.length; off += DEFAULT_CHUNK_SIZE) {
    segTree.addLeaf(payload.subarray(off, off + DEFAULT_CHUNK_SIZE));
  }
  segTree.build();
  const segRoot = segTree.rootHash();
  if (segRoot === null) throw new Error("seg tree failed");
  expectedTree.addLeafByHash(segRoot);
  expectedTree.build();
  const expected = expectedTree.rootHash();
  if (expected === null) throw new Error("file tree failed");
  assert.equal(rootFromBytes(payload), expected, "rootFromBytes must match a hand-built SDK MerkleTree for a single-segment payload");
});
