import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import { keccak256, type Signer } from "ethers";
import type { Hex } from "viem";

/**
 * Storage adapter interface for the oracle service. Implementations handle
 * blob upload/download (backed by 0G Storage in production, an in-memory Map
 * in dev/test) plus a "seen dataHash" set that binds on-chain OwnershipProofs
 * to previously-uploaded storage roots (ERC-7857 storage+chain binding).
 */
export interface StorageAdapter {
  upload(blob: Uint8Array): Promise<{ rootHash: Hex }>;
  download(rootHash: Hex): Promise<Uint8Array>;
  markDataHashSeen(rootHash: Hex): void;
  hasSeenDataHash(rootHash: Hex): boolean;
}

/**
 * In-memory storage adapter for dev/test. Uses keccak256 of the blob as a
 * stand-in root hash (mimicking 0G's Merkle root) so the oracle can be tested
 * in isolation without a live 0G Storage node.
 */
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

/**
 * Production storage adapter backed by real 0G Storage.
 * Uses the SDK directly (@0gfoundation/0g-storage-ts-sdk).
 */
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
    const [tx, err] = await this.indexer.upload(
      new MemData(blob), this.evmRpc, this.signer, {}
    );
    if (err) throw err;
    if (!tx) throw new Error("0G Storage upload returned no transaction");
    const rootHash = "rootHash" in tx ? tx.rootHash : tx.rootHashes[0];
    if (!rootHash) throw new Error("0G Storage upload returned no rootHash");
    return { rootHash: rootHash as Hex };
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
