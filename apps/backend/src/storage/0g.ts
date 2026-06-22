// Package migrated from @0gfoundation/0g-ts-sdk to @0gfoundation/0g-storage-ts-sdk.
// The old package name still resolves (back-compat re-export) but has been
// fully replaced across all consumers.
import { Indexer, MemData, MerkleTree, DEFAULT_CHUNK_SIZE } from "@0gfoundation/0g-storage-ts-sdk";
import { ethers, type Signer } from "ethers";
import type { Hex } from "viem";
import { OG_NETWORKS, pickOGNetwork } from "@axiom/config/networks";
export type { OGNetwork } from "@axiom/config/networks";
export { OG_NETWORKS, pickOGNetwork };

/**
 * Typed wrapper around @0gfoundation/0g-storage-ts-sdk for 0G Storage.
 * <p>Package was renamed from @0gfoundation/0g-ts-sdk to @0gfoundation/0g-storage-ts-sdk.
 * <p>Two client-side encryption modes are supported (set via the SDK's `encryption` option):
 *  - aes256: 32-byte symmetric key, AES-256-CTR + 17-byte header [v=0x01][nonce:16].
 *  - ecies:   33-byte compressed receiver pubkey, ECDH+HKDF+AES-256-CTR.
 */

/**
 * Retry wrapper for transient SDK failures. 3 attempts with
 * exponential backoff: 100ms, 400ms, 900ms.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts?: { attempts?: number }): Promise<T> {
  const maxAttempts = opts?.attempts ?? 3;
  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < maxAttempts - 1) {
        const delay = 100 * (i + 1) * (i + 1); // 100, 400, 900
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

export interface ZeroGStorageConfig {
  indexerRpc: string;
  evmRpc: string;
  signer: Signer;
}

export interface UploadResult {
  rootHash: Hex;
  txHash: Hex;
  size: number;
}

export interface DownloadResult {
  data: Uint8Array;
  rootHash: Hex;
  size: number;
}

export type Encryption = { type: "aes256"; key: Uint8Array } | { type: "ecies"; recipientPubKey: Uint8Array | string };

/**
 * Thread-safe nonce manager for concurrent uploads from the same wallet.
 * Reads the current nonce from chain lazily, then hands out sequentially
 * increasing values. This prevents "replacement transaction underpriced"
 * errors when multiple `uploadData` calls race on the same EVM nonce.
 *
 * The SDK's UploadOption supports a `nonce?: bigint` field; we pass the
 * managed nonce through that channel.
 */
class NonceManager {
  private provider: ethers.JsonRpcProvider;
  private signer: Signer;
  private address: string | null = null;
  private nextNonce: Promise<bigint> | null = null;

  constructor(evmRpc: string, signer: Signer) {
    this.provider = new ethers.JsonRpcProvider(evmRpc);
    this.signer = signer;
  }

  /** Atomically allocate the next nonce for this wallet. */
  async getNextNonce(): Promise<bigint> {
    if (!this.nextNonce) {
      this.address ??= await this.signer.getAddress();
      const nonce = await this.provider.getTransactionCount(this.address, "pending");
      this.nextNonce = Promise.resolve(BigInt(nonce));
    }
    const nonce = await this.nextNonce;
    this.nextNonce = Promise.resolve(nonce + 1n);
    return nonce;
  }
}

/**
 * Minimal typed wrapper around the 0G Storage Indexer.
 * Uploads in-memory data via MemData, downloads via downloadToBlob,
 * and wraps both with retry logic.
 *
 * Concurrent uploads from the same wallet are protected by NonceManager
 * which hands out strictly increasing EVM nonces.
 */
export class ZeroGStorage {
  readonly indexer: Indexer;
  readonly config: ZeroGStorageConfig;
  private nonceManager: NonceManager | null = null;

  constructor(config: ZeroGStorageConfig) {
    this.config = config;
    this.indexer = new Indexer(config.indexerRpc);
  }

  async uploadData(data: Uint8Array, encryption?: Encryption): Promise<UploadResult> {
    if (!this.nonceManager) {
      this.nonceManager = new NonceManager(this.config.evmRpc, this.config.signer);
    }
    const nonce = await this.nonceManager.getNextNonce();
    const uploadOpts = encryption ? { encryption, nonce } : { nonce };
    const [tx, err] = await withRetry(() =>
      this.indexer.upload(new MemData(data), this.config.evmRpc, this.config.signer, uploadOpts),
    );
    if (err) throw new Error(`0G upload failed: ${err.message ?? String(err)}`);
    if (!tx) throw new Error("0G Storage upload returned no transaction");
    if ("rootHash" in tx) {
      return { rootHash: tx.rootHash as Hex, txHash: tx.txHash as Hex, size: data.length };
    }
    const rootHash = tx.rootHashes[0];
    const txHash = tx.txHashes[0];
    if (!rootHash || !txHash) throw new Error("0G Storage upload returned empty rootHashes/txHashes");
    return { rootHash: rootHash as Hex, txHash: txHash as Hex, size: data.length };
  }

  async download(
    rootHash: Hex,
    opts: { symmetricKey?: Uint8Array; privateKey?: Uint8Array | string; withProof?: boolean } = {},
  ): Promise<DownloadResult> {
    const downloadOpts = { proof: opts.withProof ?? true, decryption: { symmetricKey: opts.symmetricKey, privateKey: opts.privateKey } };
    const [blob, err] = await withRetry(() => this.indexer.downloadToBlob(rootHash, downloadOpts));
    if (err) throw new Error(`0G download failed: ${err.message ?? String(err)}`);
    if (!blob) throw new Error(`0G Storage download returned no blob for ${rootHash}`);
    const data = new Uint8Array(await blob.arrayBuffer());
    return { data, rootHash, size: data.length };
  }
}

// ─── Merkle proof helpers (migrated from merkle.ts) ────────────

/** Proof shape from SDK: lemma[0]=leaf, lemma[-1]=root. */
export interface MerkleProof {
  readonly lemma: readonly string[];
  readonly path: readonly boolean[];
}

/** OZ-equivalent processProof — fold leaf to root via sibling hashes. */
function processProof(leaf: string, lemma: readonly string[], path: readonly boolean[]): string {
  let hash = leaf;
  for (let i = 0; i < path.length; i++) {
    const sibling = lemma[i + 1];
    if (sibling === undefined) throw new Error(`proof truncated at index ${i}`);
    hash = path[i] ? ethers.keccak256(ethers.concat([hash, sibling])) : ethers.keccak256(ethers.concat([sibling, hash]));
  }
  return hash;
}

/** Off-chain OZ MerkleProof.verify — true iff leaf + siblings re-derive root. */
export function verifyProof(root: Hex, leaf: Hex, proof: MerkleProof): boolean {
  if (proof.lemma.length < 1 || proof.lemma[0] !== leaf || proof.lemma[proof.lemma.length - 1] !== root) return false;
  if (proof.path.length + 2 !== proof.lemma.length) return false;
  try { return processProof(leaf, proof.lemma, proof.path) === root; } catch { return false; }
}

/** Per-segment Merkle root for ≤1024 chunks of 256 bytes (mirrors SDK's AbstractFile.segmentRoot). */
function computeSegmentRoot(segment: Uint8Array): string {
  const tree = new MerkleTree();
  for (let off = 0; off < segment.length; off += DEFAULT_CHUNK_SIZE) tree.addLeaf(segment.subarray(off, off + DEFAULT_CHUNK_SIZE));
  tree.build();
  return tree.rootHash() ?? "";
}

/** Re-derive file Merkle root from raw bytes (mirrors SDK's AbstractFile.merkleTree()). */
export function rootFromBytes(bytes: Uint8Array): string {
  if (bytes.length === 0) return "0x" + "00".repeat(32);
  const SEGMENT_SIZE = 1024 * DEFAULT_CHUNK_SIZE; // 1024 chunks per segment (256 KiB)
  const fileTree = new MerkleTree();
  for (let off = 0; off < bytes.length; off += SEGMENT_SIZE) {
    fileTree.addLeafByHash(computeSegmentRoot(bytes.subarray(off, Math.min(off + SEGMENT_SIZE, bytes.length))));
  }
  fileTree.build();
  return fileTree.rootHash() ?? "";
}
