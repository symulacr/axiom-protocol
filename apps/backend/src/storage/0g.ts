import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import type { Signer } from "ethers";
import type { Hex } from "viem";
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

/** Typed wrapper around the 0G Storage Indexer with retry. */
export class ZeroGStorage {
  readonly indexer: Indexer;
  readonly config: ZeroGStorageConfig;

  constructor(config: ZeroGStorageConfig) {
    this.config = config;
    this.indexer = new Indexer(config.indexerRpc);
  }

  async uploadData(data: Uint8Array, encryption?: Encryption): Promise<UploadResult> {
    const uploadOpts = encryption ? { encryption } : {};
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

