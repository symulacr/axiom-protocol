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
  upload(blob: Uint8Array, encryption?: Encryption): Promise<{ rootHash: Hex }>;
  download(rootHash: Hex): Promise<Uint8Array>;
  markDataHashSeen(rootHash: Hex): void;
  hasSeenDataHash(rootHash: Hex): boolean;
}

export interface ZeroGStorageConfig {
  indexerRpc: string;
  evmRpc: string;
  signer: Signer;
}

export type Encryption = EncryptionOption;

export interface UploadOptions {
  encryption?: Encryption;
  expectedReplica?: number;
  taskSize?: number;
}

export interface DownloadOptions {
  symmetricKey?: Uint8Array;
  privateKey?: Uint8Array | string;
  withProof?: boolean;
}


export class InMemoryStorage implements StorageAdapter {
  private store = new Map<string, Uint8Array>();
  private seenDataHashes = new Set<string>();
  private readonly MAX_SEEN_HASHES = 10_000;

  async upload(
    blob: Uint8Array,
    _encryption?: Encryption,
  ): Promise<{ rootHash: Hex }> {
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
    if (this.seenDataHashes.size >= this.MAX_SEEN_HASHES) {
      const iter = this.seenDataHashes.values();
      for (let i = 0; i < 1000; i++) {
        const val = iter.next().value;
        if (val !== undefined) this.seenDataHashes.delete(val);
        else break;
      }
    }
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
  private readonly MAX_SEEN_HASHES = 10_000;

  constructor(config: ZeroGStorageConfig) {
    this.config = config;
    this.indexer = new Indexer(config.indexerRpc);
  }

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
    if (this.seenDataHashes.size >= this.MAX_SEEN_HASHES) {
      const iter = this.seenDataHashes.values();
      for (let i = 0; i < 1000; i++) {
        const val = iter.next().value;
        if (val !== undefined) this.seenDataHashes.delete(val);
        else break;
      }
    }
    this.seenDataHashes.add(rootHash.toLowerCase());
  }

  hasSeenDataHash(rootHash: Hex): boolean {
    return this.seenDataHashes.has(rootHash.toLowerCase());
  }

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
