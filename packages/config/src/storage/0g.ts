import { Indexer, MemData, tryDecrypt } from "@0gfoundation/0g-storage-ts-sdk";
import { keccak256, type Signer } from "ethers";
import type { Hex } from "viem";

// ── Public types ──────────────────────────────────────────────────────────

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

// ── Retry helper (moved from backend) ─────────────────────────────────────

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: { attempts?: number },
): Promise<T> {
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

// ── In-memory storage for dev/test (moved from oracle) ────────────────────

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

// ── Core upload/download helpers (augmented from existing) ────────────────

export async function uploadToStorage(
  indexer: Indexer,
  data: Uint8Array,
  evmRpc: string,
  signer: Signer,
  encryption?: Encryption,
): Promise<UploadResult> {
  const opts = encryption ? { encryption } : {};
  const [tx, err] = await indexer.upload(new MemData(data), evmRpc, signer, opts);
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
    decryption: { symmetricKey: opts?.symmetricKey, privateKey: opts?.privateKey },
  };
  const [blob, err] = await indexer.downloadToBlob(rootHash, downloadOpts);
  if (err) throw new Error(`0G download failed: ${err.message ?? String(err)}`);
  if (!blob) throw new Error(`0G Storage download returned no blob for ${rootHash}`);
  const data = new Uint8Array(await blob.arrayBuffer());

  // 🛡️ Guard against silent decryption failure (tryDecrypt never throws)
  if (opts?.symmetricKey || opts?.privateKey) {
    const result = tryDecrypt(data, {
      symmetricKey: opts.symmetricKey,
      privateKey: opts.privateKey,
    });
    if (!result.decrypted) {
      throw new Error(
        `0G Storage decryption failed for ${rootHash}: ` +
          "the SDK returned raw bytes (wrong key, missing header, or malformed data). " +
          "Check that the correct decryption key was provided and that the file was SDK-encrypted.",
      );
    }
  }

  return { data, rootHash, size: data.length };
}

// ── Unified ZeroGStorage (replaces backend + oracle wrappers) ─────────────

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
    const result = await withRetry(() =>
      uploadToStorage(this.indexer, blob, this.config.evmRpc, this.config.signer),
    );
    return { rootHash: result.rootHash };
  }

  async download(rootHash: Hex): Promise<Uint8Array> {
    const result = await withRetry(() =>
      downloadFromStorage(this.indexer, rootHash, { withProof: false }),
    );
    return result.data;
  }

  markDataHashSeen(rootHash: Hex): void {
    this.seenDataHashes.add(rootHash.toLowerCase());
  }

  hasSeenDataHash(rootHash: Hex): boolean {
    return this.seenDataHashes.has(rootHash.toLowerCase());
  }

  // Backward-compat methods (for backend consumers)
  async uploadData(data: Uint8Array, encryption?: Encryption): Promise<UploadResult> {
    return withRetry(() =>
      uploadToStorage(this.indexer, data, this.config.evmRpc, this.config.signer, encryption),
    );
  }

  async downloadWithOpts(
    rootHash: Hex,
    opts?: { symmetricKey?: Uint8Array; privateKey?: Uint8Array | string; withProof?: boolean },
  ): Promise<DownloadResult> {
    return withRetry(() => downloadFromStorage(this.indexer, rootHash, opts));
  }
}

// TODO Wave 4: Delete apps/backend/src/storage/0g.ts — functionality consolidated here
// TODO Wave 4: Delete apps/oracle/src/storage.ts — functionality consolidated here
