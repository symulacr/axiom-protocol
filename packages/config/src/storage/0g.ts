import {
  Indexer,
  MemData,
  EncryptionHeader,
} from "@0gfoundation/0g-storage-ts-sdk";
import type { EncryptionOption } from "@0gfoundation/0g-storage-ts-sdk";
import { keccak256, type Signer } from "ethers";
import type { Hex } from "viem";

interface UploadResult {
  rootHash: Hex;
  txHash: Hex;
  size: number;
}

interface DownloadResult {
  data: Uint8Array;
  rootHash: Hex;
  size: number;
}

export interface StorageAdapter {
  upload(blob: Uint8Array): Promise<{ rootHash: Hex }>;
  download(rootHash: Hex): Promise<Uint8Array>;
  markDataHashSeen(rootHash: Hex): void;
  hasSeenDataHash(rootHash: Hex): boolean;
}

export interface ZeroGStorageConfig {
  indexerRpc: string;
  evmRpc: string;
  signer: Signer;
}

/**
 * Encryption payload for 0G Storage uploads and downloads.
 * Re-exports the SDK's `EncryptionOption` so callers don't import from the
 * SDK directly. Encrypted uploads are auto-decrypted on download when the
 * matching key is supplied to `downloadFromStorage`.
 */
export type Encryption = EncryptionOption;

export interface UploadOptions {
  /** Encrypt the upload with the matching symmetric key (AES-256) or ECIES recipient pubkey. */
  encryption?: Encryption;
  /** Number of replicas to fan out to (default: SDK default = 1). */
  expectedReplica?: number;
  /** Override the per-task chunk size (default: SDK default = 10). */
  taskSize?: number;
}

export interface DownloadOptions {
  symmetricKey?: Uint8Array;
  privateKey?: Uint8Array | string;
  /** Force-enable merkle proof verification on download (default: true). */
  withProof?: boolean;
}

// In-memory storage for dev/test

export class InMemoryStorage implements StorageAdapter {
  private store = new Map<string, Uint8Array>();
  private seenDataHashes = new Set<string>();

  async upload(blob: Uint8Array): Promise<{ rootHash: Hex }> {
    const rootHash = keccak256(blob) as Hex;
    this.store.set(rootHash.toLowerCase(), new Uint8Array(blob));
    return { rootHash };
  }

  async download(rootHash: Hex): Promise<Uint8Array> {
    const blob = this.store.get(rootHash.toLowerCase());
    if (!blob) throw new Error(`Blob not found: ${rootHash}`);
    return new Uint8Array(blob);
  }

  markDataHashSeen(rootHash: Hex): void {
    this.seenDataHashes.add(rootHash.toLowerCase());
  }

  hasSeenDataHash(rootHash: Hex): boolean {
    return this.seenDataHashes.has(rootHash.toLowerCase());
  }
}

/**
 * Upload raw bytes to 0G Storage.
 *
 * Calls `memData.merkleTree()` before upload per the SDK's documented pattern
 * so the file is fully fragmented and the merkle root is computed up-front.
 * The upload itself also computes the tree internally — the pre-call is a
 * defensive alignment with the v1.2 SDK recommendation.
 *
 * Encryption is forwarded to the SDK's `UploadOption.encryption` field.
 */
export async function uploadToStorage(
  indexer: Indexer,
  data: Uint8Array,
  evmRpc: string,
  signer: Signer,
  options: UploadOptions = {},
): Promise<UploadResult> {
  const memData = new MemData(data);
  const [tree, treeErr] = await memData.merkleTree();
  if (treeErr)
    throw new Error(
      `0G merkle tree computation failed: ${treeErr.message ?? String(treeErr)}`,
    );
  if (!tree) throw new Error("0G merkle tree computation returned null");

  const uploadOpts: Parameters<typeof indexer.upload>[3] = {
    expectedReplica: options.expectedReplica,
    taskSize: options.taskSize,
    encryption: options.encryption,
  };

  const [tx, err] = await indexer.upload(memData, evmRpc, signer, uploadOpts);
  if (err) throw new Error(`0G upload failed: ${err.message ?? String(err)}`);
  if (!tx) throw new Error("0G Storage upload returned no transaction");
  const rootHash =
    "rootHash" in tx ? (tx.rootHash as Hex) : (tx.rootHashes[0] as Hex);
  const txHash = "txHash" in tx ? (tx.txHash as Hex) : (tx.txHashes[0] as Hex);
  if (!rootHash || !txHash)
    throw new Error("0G Storage upload returned empty hashes");
  return { rootHash, txHash, size: data.length };
}

/**
 * Download bytes from 0G Storage.
 *
 * Decryption keys (symmetric or ECIES private) are forwarded to the SDK's
 * `DownloadOption.decryption` field. The SDK auto-detects the encryption
 * header on the file and applies the matching cipher.
 */
export async function downloadFromStorage(
  indexer: Indexer,
  rootHash: Hex,
  opts: DownloadOptions = {},
): Promise<DownloadResult> {
  const downloadOpts: Parameters<typeof indexer.downloadToBlob>[1] = {
    proof: opts.withProof ?? true,
  };
  if (opts.symmetricKey || opts.privateKey) {
    downloadOpts.decryption = {
      ...(opts.symmetricKey ? { symmetricKey: opts.symmetricKey } : {}),
      ...(opts.privateKey ? { privateKey: opts.privateKey } : {}),
    };
  }
  const [blob, err] = await indexer.downloadToBlob(rootHash, downloadOpts);
  if (err) throw new Error(`0G download failed: ${err.message ?? String(err)}`);
  if (!blob)
    throw new Error(`0G Storage download returned no blob for ${rootHash}`);
  const data = new Uint8Array(await blob.arrayBuffer());

  return { data, rootHash, size: data.length };
}

/**
 * Inspect the first bytes of a stored file to detect its encryption header
 * without paying for a full download. Returns the parsed header on match, or
 * `null` if the file is unencrypted or the header is malformed.
 *
 * Use this to render a "key required" prompt before the actual download.
 */
export async function peekStorageHeader(
  indexer: Indexer,
  rootHash: Hex,
): Promise<EncryptionHeader | null> {
  const [header, err] = await indexer.peekHeader(rootHash);
  if (err) {
    throw new Error(`0G peekHeader failed: ${err.message ?? String(err)}`);
  }
  return header;
}

export class ZeroGStorage implements StorageAdapter {
  readonly indexer: Indexer;
  readonly config: ZeroGStorageConfig;
  private seenDataHashes = new Set<string>();

  constructor(config: ZeroGStorageConfig) {
    this.config = config;
    this.indexer = new Indexer(config.indexerRpc);
  }

  // StorageAdapter interface (for oracle compat)
  async upload(
    blob: Uint8Array,
    encryption?: Encryption,
  ): Promise<{ rootHash: Hex }> {
    const result = await uploadToStorage(
      this.indexer,
      blob,
      this.config.evmRpc,
      this.config.signer,
      { encryption },
    );
    return { rootHash: result.rootHash };
  }

  async download(rootHash: Hex): Promise<Uint8Array> {
    const result = await downloadFromStorage(this.indexer, rootHash, {
      withProof: false,
    });
    return result.data;
  }

  markDataHashSeen(rootHash: Hex): void {
    this.seenDataHashes.add(rootHash.toLowerCase());
  }

  hasSeenDataHash(rootHash: Hex): boolean {
    return this.seenDataHashes.has(rootHash.toLowerCase());
  }

  // Backward-compat methods (for backend consumers)
  async uploadData(
    data: Uint8Array,
    options: UploadOptions = {},
  ): Promise<UploadResult> {
    return uploadToStorage(
      this.indexer,
      data,
      this.config.evmRpc,
      this.config.signer,
      options,
    );
  }

  async downloadWithOpts(
    rootHash: Hex,
    opts: DownloadOptions = {},
  ): Promise<DownloadResult> {
    return downloadFromStorage(this.indexer, rootHash, opts);
  }
}
