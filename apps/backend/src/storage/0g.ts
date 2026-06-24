import { Indexer } from "@0gfoundation/0g-storage-ts-sdk";
import type { Signer } from "ethers";
import type { Hex } from "viem";
import { uploadToStorage, downloadFromStorage } from "@axiom/config/storage/0g";
import type { UploadResult, DownloadResult } from "@axiom/config/storage/0g";
import { OG_NETWORKS, pickOGNetwork } from "@axiom/config/networks";
export type { OGNetwork } from "@axiom/config/networks";
export { OG_NETWORKS, pickOGNetwork };

/**
 * Typed wrapper around @0gfoundation/0g-storage-ts-sdk.
 */

/** Retry wrapper: 3 attempts with exponential backoff (100, 400, 900ms). */
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

export type Encryption = { type: "aes256"; key: Uint8Array } | { type: "ecies"; recipientPubKey: Uint8Array | string };

/** Typed wrapper around the 0G Storage Indexer with retry. */
export class ZeroGStorage {
  readonly indexer: Indexer;
  readonly config: ZeroGStorageConfig;

  constructor(config: ZeroGStorageConfig) {
    this.config = config;
    this.indexer = new Indexer(config.indexerRpc);
  }

  async uploadData(data: Uint8Array, encryption?: Encryption): Promise<UploadResult> {
    return withRetry(() => uploadToStorage(this.indexer, data, this.config.evmRpc, this.config.signer, encryption));
  }

  async download(
    rootHash: Hex,
    opts: { symmetricKey?: Uint8Array; privateKey?: Uint8Array | string; withProof?: boolean } = {},
  ): Promise<DownloadResult> {
    return withRetry(() => downloadFromStorage(this.indexer, rootHash, opts));
  }
}

