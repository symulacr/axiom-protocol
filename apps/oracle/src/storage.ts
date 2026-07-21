import { Indexer } from "@0gfoundation/0g-storage-ts-sdk";
import { keccak256, type Signer } from "ethers";
import type { Hex } from "viem";
import { uploadToStorage } from "@axiom/config/storage/0g";

/** Storage adapter: blob upload/download and seen-dataHash tracking. */
export interface StorageAdapter {
  upload(blob: Uint8Array): Promise<{ rootHash: Hex }>;
  download(rootHash: Hex): Promise<Uint8Array>;
  markDataHashSeen(rootHash: Hex): void;
  hasSeenDataHash(rootHash: Hex): boolean;
}

/** In-memory storage adapter for dev/test. Uses keccak256 as a stand-in root hash. */
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

  markDataHashSeen(rootHash: Hex): void { this.seenDataHashes.add(rootHash.toLowerCase()); }
  hasSeenDataHash(rootHash: Hex): boolean { return this.seenDataHashes.has(rootHash.toLowerCase()); }
}

/** Production storage adapter backed by real 0G Storage. */
export class ZeroGStorage implements StorageAdapter {
  private readonly indexer: Indexer;
  private readonly evmRpc: string;
  private readonly signer: Signer;
  private seenDataHashes = new Set<string>();

  constructor(config: { indexerRpc: string; evmRpc: string; signer: Signer }) {
    this.indexer = new Indexer(config.indexerRpc);
    this.evmRpc = config.evmRpc;
    this.signer = config.signer;
  }

  async upload(blob: Uint8Array): Promise<{ rootHash: Hex }> {
    const result = await uploadToStorage(this.indexer, blob, this.evmRpc, this.signer);
    return { rootHash: result.rootHash };
  }

  async download(rootHash: Hex): Promise<Uint8Array> {
    const [blob, err] = await this.indexer.downloadToBlob(rootHash, { proof: false });
    if (err) throw err;
    if (!blob) throw new Error(`0G Storage download returned no blob for ${rootHash}`);
    return new Uint8Array(await blob.arrayBuffer());
  }

  markDataHashSeen(rootHash: Hex): void { this.seenDataHashes.add(rootHash.toLowerCase()); }
  hasSeenDataHash(rootHash: Hex): boolean { return this.seenDataHashes.has(rootHash.toLowerCase()); }
}
