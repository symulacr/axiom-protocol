import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import type { EncryptionOption } from "@0gfoundation/0g-storage-ts-sdk";
import { keccak256, type Signer } from "ethers";
import type { Hex } from "viem";
import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";

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


const ORACLE_SEEN_HASHES_FILE = join(
  process.env.AXIOM_DATA_DIR ?? process.cwd(),
  ".data",
  "oracle-seen-hashes.json",
);

export interface SeenHashesOptions {
  seenHashesFile?: string;
}

function loadSeenDataHashes(file: string): Set<string> {
  try {
    if (!existsSync(file)) return new Set();
    const raw = readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw) as { seenDataHashes?: unknown };
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.seenDataHashes)
    ) {
      throw new Error(
        "oracle seen-hashes file root is missing a string array",
      );
    }
    const seen = new Set<string>();
    for (const item of parsed.seenDataHashes) {
      if (typeof item === "string") seen.add(item.toLowerCase());
    }
    return seen;
  } catch {
    if (existsSync(file)) {
      try {
        renameSync(file, `${file}.bak`);
      } catch {
        /* ignore — backup is best-effort */
      }
    }
    return new Set();
  }
}

function persistSeenDataHashes(file: string, seen: Set<string>): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tmp, JSON.stringify({ seenDataHashes: [...seen] }));
  renameSync(tmp, file);
}

export class InMemoryStorage implements StorageAdapter {
  private store = new Map<string, Uint8Array>();
  private seenDataHashes: Set<string>;
  private readonly seenHashesFile: string;

  constructor(options: SeenHashesOptions = {}) {
    this.seenHashesFile = options.seenHashesFile ?? ORACLE_SEEN_HASHES_FILE;
    this.seenDataHashes = loadSeenDataHashes(this.seenHashesFile);
  }

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
    const hash = rootHash.toLowerCase();
    if (this.seenDataHashes.has(hash)) return;
    this.seenDataHashes.add(hash);
    persistSeenDataHashes(this.seenHashesFile, this.seenDataHashes);
  }

  hasSeenDataHash(rootHash: Hex): boolean {
    return this.seenDataHashes.has(rootHash.toLowerCase());
  }
}
function extractUploadResult(
  result: unknown,
  dataLength: number,
): UploadResult {
  if (!result || typeof result !== "object") {
    throw new Error("0G Storage upload returned no transaction");
  }
  const tx = result as Record<string, unknown>;
  if ("rootHash" in tx && "txHash" in tx) {
    return { rootHash: tx.rootHash as Hex, txHash: tx.txHash as Hex, size: dataLength };
  }
  if (tx.rootHashes && Array.isArray(tx.rootHashes) && tx.txHashes && Array.isArray(tx.txHashes)) {
    return { rootHash: tx.rootHashes[0] as Hex, txHash: tx.txHashes[0] as Hex, size: dataLength };
  }
  throw new Error("0G Storage upload returned unrecognized result format");
}

export async function uploadToStorage(
  indexer: Indexer,
  data: Uint8Array,
  evmRpc: string,
  signer: Signer,
  options: UploadOptions = {},
): Promise<UploadResult> {
  const memData = new MemData(data);
  const uploadOpts: Parameters<typeof indexer.upload>[3] = {
    expectedReplica: options.expectedReplica,
    taskSize: options.taskSize,
    encryption: options.encryption,
  };
  const [tx, err] = await indexer.upload(memData, evmRpc, signer, uploadOpts);
  if (err) throw new Error(`0G upload failed: ${err.message ?? String(err)}`);
  return extractUploadResult(tx, data.length);
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

export class ZeroGStorage implements StorageAdapter {
  readonly indexer: Indexer;
  readonly config: ZeroGStorageConfig;
  private seenDataHashes: Set<string>;
  private readonly seenHashesFile: string;

  constructor(config: ZeroGStorageConfig, options: SeenHashesOptions = {}) {
    this.config = config;
    this.indexer = new Indexer(config.indexerRpc);
    this.seenHashesFile = options.seenHashesFile ?? ORACLE_SEEN_HASHES_FILE;
    this.seenDataHashes = loadSeenDataHashes(this.seenHashesFile);
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
    const hash = rootHash.toLowerCase();
    if (this.seenDataHashes.has(hash)) return;
    this.seenDataHashes.add(hash);
    persistSeenDataHashes(this.seenHashesFile, this.seenDataHashes);
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
