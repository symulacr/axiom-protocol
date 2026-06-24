import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import { type Signer } from "ethers";
import type { Hex } from "viem";

/** Matches the SDK's EncryptionOption type. */
type EncryptionOption =
  | { type: "aes256"; key: Uint8Array }
  | { type: "ecies"; recipientPubKey: Uint8Array | string };

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

/**
 * Shared core upload helper. Used by backend, oracle, and indexer.
 * The SDK's Indexer handles EVM nonce management internally.
 */
export async function uploadToStorage(
  indexer: Indexer,
  data: Uint8Array,
  evmRpc: string,
  signer: Signer,
  encryption?: EncryptionOption,
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
  return { data, rootHash, size: data.length };
}
