import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
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

// Re-export SDK's EncryptionOption type so callers don't import from SDK directly
export type Encryption =
  | { type: "aes256"; key: Uint8Array }
  | { type: "ecies"; recipientPubKey: Uint8Array | string };

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

export async function uploadToStorage(
  indexer: Indexer,
  data: Uint8Array,
  evmRpc: string,
  signer: Signer,
): Promise<UploadResult> {
  const [tx, err] = await indexer.upload(new MemData(data), evmRpc, signer);
  if (err) throw new Error(`0G upload failed: ${err.message ?? String(err)}`);
  if (!tx) throw new Error("0G Storage upload returned no transaction");
  const rootHash = "rootHash" in tx ? (tx.rootHash as Hex) : (tx.rootHashes[0] as Hex);
  const txHash = "txHash" in tx ? (tx.txHash as Hex) : (tx.txHashes[0] as Hex);
  if (!rootHash || !txHash) throw new Error("0G Storage upload returned empty hashes");
  return { rootHash, txHash, size: data.length };
}

export async function downloadFromStorage(
  indexer: Indexer,
  rootHash: Hex,
  opts?: { symmetricKey?: Uint8Array; privateKey?: Uint8Array | string; withProof?: boolean },
): Promise<DownloadResult> {
  const downloadOpts = {
    proof: opts?.withProof ?? true,
  };
  const [blob, err] = await indexer.downloadToBlob(rootHash, downloadOpts);
  if (err) throw new Error(`0G download failed: ${err.message ?? String(err)}`);
  if (!blob) throw new Error(`0G Storage download returned no blob for ${rootHash}`);
  const data = new Uint8Array(await blob.arrayBuffer());

  return { data, rootHash, size: data.length };
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
  async upload(blob: Uint8Array): Promise<{ rootHash: Hex }> {
    const result = await uploadToStorage(this.indexer, blob, this.config.evmRpc, this.config.signer);
    return { rootHash: result.rootHash };
  }

  async download(rootHash: Hex): Promise<Uint8Array> {
    const result = await downloadFromStorage(this.indexer, rootHash, { withProof: false });
    return result.data;
  }

  markDataHashSeen(rootHash: Hex): void {
    this.seenDataHashes.add(rootHash.toLowerCase());
  }

  hasSeenDataHash(rootHash: Hex): boolean {
    return this.seenDataHashes.has(rootHash.toLowerCase());
  }

  // Backward-compat methods (for backend consumers)
  async uploadData(data: Uint8Array, _encryption?: Encryption): Promise<UploadResult> {
    return uploadToStorage(this.indexer, data, this.config.evmRpc, this.config.signer);
  }

  async downloadWithOpts(
    rootHash: Hex,
    opts?: { symmetricKey?: Uint8Array; privateKey?: Uint8Array | string; withProof?: boolean },
  ): Promise<DownloadResult> {
    return downloadFromStorage(this.indexer, rootHash, opts);
  }
}

