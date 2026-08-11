import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import type { EncryptionOption } from "@0gfoundation/0g-storage-ts-sdk";

import { keccak256, type Signer } from "ethers";
import type { Hex } from "viem";
import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { dirnamePath, joinPath } from "../path.js";

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
  upload(
    blob: Uint8Array,
    encryption?: Encryption,
  ): Promise<{ rootHash: Hex }> | { rootHash: Hex };
  download(rootHash: Hex): Promise<Uint8Array> | Uint8Array;
  markDataHashSeen(rootHash: Hex): void;
  hasSeenDataHash(rootHash: Hex): boolean;
}

interface ZeroGStorageConfig {
  indexerRpc: string;
  evmRpc: string;
  signer: Signer;
}

type Encryption = EncryptionOption;

interface UploadOptions {
  encryption?: Encryption;
  expectedReplica?: number;
  taskSize?: number;
}

interface DownloadOptions {
  symmetricKey?: Uint8Array;
  privateKey?: Uint8Array | string;
  withProof?: boolean;
}

const ORACLE_SEEN_HASHES_FILE = joinPath(
  process.env.AXIOM_DATA_DIR ?? process.cwd(),
  ".data",
  "oracle-seen-hashes.json",
);

interface SeenHashesOptions {
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
      throw new Error("oracle seen-hashes file root is missing a string array");
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
        /* ignore — backup is best-effort; a failed rename must not block startup */
      }
    }
    return new Set();
  }
}

function persistSeenDataHashes(file: string, seen: Set<string>): void {
  mkdirSync(dirnamePath(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  writeFileSync(tmp, JSON.stringify({ seenDataHashes: [...seen] }));
  renameSync(tmp, file);
}

abstract class SeenHashesMixin {
  protected seenDataHashes: Set<string>;
  protected readonly seenHashesFile: string;

  constructor(seenHashesFile: string) {
    this.seenHashesFile = seenHashesFile;
    this.seenDataHashes = loadSeenDataHashes(seenHashesFile);
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

export class InMemoryStorage extends SeenHashesMixin implements StorageAdapter {
  private store = new Map<string, Uint8Array>();

  constructor(options: SeenHashesOptions = {}) {
    super(options.seenHashesFile ?? ORACLE_SEEN_HASHES_FILE);
  }

  upload(blob: Uint8Array, _encryption?: Encryption): { rootHash: Hex } {
    const rootHash = keccak256(blob) as Hex;
    this.store.set(rootHash.toLowerCase(), new Uint8Array(blob));
    return { rootHash };
  }

  download(rootHash: Hex): Uint8Array {
    const blob = this.store.get(rootHash.toLowerCase());
    if (!blob) throw new Error(`Blob not found: ${rootHash}`);
    return new Uint8Array(blob);
  }
}
async function uploadToStorage(
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
  const result = tx as { rootHash: string; txHash: string };
  if (!result.rootHash)
    throw new Error("SDK upload returned unexpected format");
  return {
    rootHash: result.rootHash as Hex,
    txHash: result.txHash as Hex,
    size: data.length,
  };
}

async function downloadFromStorage(
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

export class ZeroGStorage extends SeenHashesMixin implements StorageAdapter {
  readonly indexer: Indexer;
  readonly config: ZeroGStorageConfig;
  // Per-instance 32-byte AES key for SDK transport encryption; regenerated on restart so old blobs
  // are undecryptable via this instance — acceptable: oracle re-encrypts (AES-GCM) every transfer.
  private readonly storageKey: Uint8Array;

  constructor(config: ZeroGStorageConfig, options: SeenHashesOptions = {}) {
    super(options.seenHashesFile ?? ORACLE_SEEN_HASHES_FILE);
    this.config = config;
    this.indexer = new Indexer(config.indexerRpc);
    this.storageKey = crypto.getRandomValues(new Uint8Array(32));
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
      {
        encryption: encryption ?? { type: "aes256", key: this.storageKey },
      },
    );
    return { rootHash: result.rootHash };
  }

  async download(rootHash: Hex): Promise<Uint8Array> {
    const result = await downloadFromStorage(this.indexer, rootHash, {
      withProof: true,
      symmetricKey: this.storageKey,
    });
    return result.data;
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
      {
        ...options,
        encryption: options.encryption ?? {
          type: "aes256",
          key: this.storageKey,
        },
      },
    );
  }

  async downloadWithOpts(
    rootHash: Hex,
    opts: DownloadOptions = {},
  ): Promise<DownloadResult> {
    return downloadFromStorage(this.indexer, rootHash, {
      ...opts,
      symmetricKey: opts.symmetricKey ?? this.storageKey,
    });
  }
}
